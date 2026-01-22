"""
队列监控和告警任务

定期收集队列指标并触发告警，支持邮件通知
"""
import logging
import statistics
from datetime import datetime, timedelta
from typing import Optional

from celery import shared_task
from sqlalchemy import select, and_

from app.celery_app import celery_app
from app.tasks.base import get_task_db
from app.utils.queue_monitor import (
    QUEUE_MONITOR_QUEUE_NAMES,
    build_status_key,
    build_completed_key,
    get_queue_monitor_redis,
)
from app.models.queue_metrics import QueueMetrics
from app.models.queue_alert import QueueAlert
from app.services.alert_service import (
    send_queue_backlog_alert,
    send_failure_rate_alert,
    send_worker_offline_alert,
    send_long_running_task_alert,
)

logger = logging.getLogger(__name__)

# 告警阈值配置
ALERT_THRESHOLDS = {
    "queue_backlog_warning": 100,      # 队列积压警告阈值
    "queue_backlog_critical": 500,     # 队列积压严重阈值
    "failure_rate_warning": 10,        # 失败率警告阈值（百分比）
    "failure_rate_critical": 25,       # 失败率严重阈值（百分比）
    "worker_offline": True,            # 检测Worker离线
    "long_running_task_minutes": 30,   # 长时间运行任务阈值（分钟）
}

# 告警冷却时间（秒），避免重复告警
ALERT_COOLDOWN_SECONDS = 3600  # 1小时


def create_and_send_alert(
    alert_type: str,
    title: str,
    message: str,
    severity: str = "warning",
    queue_name: Optional[str] = None,
    current_value: Optional[float] = None,
    threshold_value: Optional[float] = None,
    extra_data: Optional[dict] = None,
) -> Optional[QueueAlert]:
    """
    创建告警记录并发送邮件通知

    返回创建的告警对象，如果告警已存在则返回None
    """
    db = get_task_db()
    try:
        # 检查是否存在相同类型和队列的活跃告警
        cooldown_time = datetime.utcnow() - timedelta(seconds=ALERT_COOLDOWN_SECONDS)

        existing_query = select(QueueAlert).where(
            and_(
                QueueAlert.alert_type == alert_type,
                QueueAlert.queue_name == (queue_name or ""),
                QueueAlert.status.in_(["firing", "acknowledged"]),
                QueueAlert.fired_at > cooldown_time,
            )
        )
        existing_result = db.execute(existing_query)
        existing_alert = existing_result.scalar_one_or_none()

        if existing_alert:
            # 如果告警已存在但邮件未发送，尝试发送
            if not existing_alert.notification_sent:
                _send_alert_email(alert_type, existing_alert)
                existing_alert.notification_sent = True
                existing_alert.notification_sent_at = datetime.utcnow()
                db.commit()
            logger.debug(f"Alert {alert_type} for {queue_name} already exists, skipping")
            return None

        # 创建新告警
        alert = QueueAlert(
            alert_type=alert_type,
            queue_name=queue_name,
            severity=severity,
            title=title,
            message=message,
            current_value=current_value,
            threshold_value=threshold_value,
            extra_data=extra_data,
            status="firing",
            notification_sent=False,
        )
        db.add(alert)
        db.commit()
        db.refresh(alert)

        # 发送邮件通知
        email_sent = _send_alert_email(alert_type, alert)
        if email_sent:
            alert.notification_sent = True
            alert.notification_sent_at = datetime.utcnow()
            db.commit()

        logger.warning(f"Alert created: {alert_type} - {title}")
        return alert

    except Exception as e:
        logger.error(f"Failed to create alert: {e}")
        db.rollback()
        return None
    finally:
        db.close()


def _send_alert_email(alert_type: str, alert: QueueAlert) -> bool:
    """
    根据告警类型发送相应的邮件

    返回是否发送成功
    """
    try:
        if alert_type == "queue_backlog":
            return send_queue_backlog_alert(
                queue_name=alert.queue_name or "",
                pending_count=int(alert.current_value or 0),
                threshold=int(alert.threshold_value or 0),
                severity=alert.severity,
            )

        elif alert_type == "high_failure_rate":
            succeeded = alert.extra_data.get("succeeded", 0) if alert.extra_data else 0
            failed = alert.extra_data.get("failed", 0) if alert.extra_data else 0
            return send_failure_rate_alert(
                queue_name=alert.queue_name or "",
                failure_rate=float(alert.current_value or 0),
                threshold=int(alert.threshold_value or 0),
                succeeded=succeeded,
                failed=failed,
                severity=alert.severity,
            )

        elif alert_type == "worker_offline":
            return send_worker_offline_alert()

        elif alert_type == "long_running_task":
            task_id = alert.extra_data.get("task_id", "") if alert.extra_data else ""
            task_name = alert.extra_data.get("task_name", "") if alert.extra_data else ""
            worker = alert.extra_data.get("worker", "") if alert.extra_data else ""
            return send_long_running_task_alert(
                task_name=task_name,
                task_id=task_id,
                running_minutes=float(alert.current_value or 0),
                queue=alert.queue_name or "",
                worker=worker,
            )

        return False

    except Exception as e:
        logger.error(f"Failed to send alert email for {alert_type}: {e}")
        return False


def auto_resolve_alerts(
    alert_type: str,
    queue_name: Optional[str] = None,
) -> None:
    """
    自动解决告警（当条件恢复正常时）
    """
    db = get_task_db()
    try:
        query = select(QueueAlert).where(
            and_(
                QueueAlert.alert_type == alert_type,
                QueueAlert.queue_name == (queue_name or ""),
                QueueAlert.status == "firing",
            )
        )

        result = db.execute(query)
        alerts = result.scalars().all()

        for alert in alerts:
            alert.status = "resolved"
            alert.resolved_at = datetime.utcnow()

        db.commit()

        if alerts:
            logger.info(f"Auto-resolved {len(alerts)} alerts for {alert_type}")

    except Exception as e:
        logger.error(f"Failed to auto-resolve alerts: {e}")
        db.rollback()
    finally:
        db.close()


@shared_task(name="app.tasks.queue_monitor_tasks.collect_queue_metrics_task")
def collect_queue_metrics_task():
    """
    收集队列指标任务

    每5分钟执行一次，收集队列状态并存储到数据库
    用于趋势分析和性能监控
    """
    logger.info("Starting queue metrics collection")

    try:
        from app.celery_app import celery_app

        redis_client = get_queue_monitor_redis()

        # 获取Worker状态
        inspect = celery_app.control.inspect(timeout=2.0)
        ping = inspect.ping() or {}
        worker_count = len(ping)

        active_tasks = 0
        if ping:
            active = inspect.active() or {}
            active_tasks = sum(len(tasks) for tasks in active.values())

        # 收集各队列指标
        metrics_collected = []
        for queue_name in QUEUE_MONITOR_QUEUE_NAMES:
            try:
                # 获取队列长度
                if queue_name == "default":
                    queue_keys = ["celery:default", "celery"]
                else:
                    queue_keys = [f"celery:{queue_name}"]

                pending_count = 0
                for key in queue_keys:
                    try:
                        pending_count += redis_client.llen(key)
                    except Exception:
                        pass

                # 获取最近完成的任务统计
                now_ts = datetime.utcnow().timestamp()
                five_min_ago = now_ts - 300

                succeeded_count = redis_client.zcount(
                    build_completed_key("succeeded"),
                    five_min_ago,
                    now_ts
                )
                failed_count = redis_client.zcount(
                    build_completed_key("failed"),
                    five_min_ago,
                    now_ts
                )

                # 获取任务执行时间（从Redis获取最近的任务）
                duration_key = f"queue:tasks:status:succeeded"
                recent_task_ids = redis_client.zrevrange(duration_key, 0, 99)

                durations = []
                for task_id in recent_task_ids:
                    task_key = f"queue:tasks:data:{task_id}"
                    task_data = redis_client.get(task_key)
                    if task_data:
                        import json
                        try:
                            task = json.loads(task_data)
                            duration = task.get("duration")
                            if duration and isinstance(duration, (int, float)):
                                durations.append(duration)
                        except (json.JSONDecodeError, TypeError):
                            pass

                # 计算执行时间统计
                avg_duration = None
                min_duration = None
                max_duration = None
                p95_duration = None
                p99_duration = None

                if durations:
                    durations.sort()
                    avg_duration = statistics.mean(durations)
                    min_duration = min(durations)
                    max_duration = max(durations)
                    p95_idx = int(len(durations) * 0.95)
                    p99_idx = int(len(durations) * 0.99)
                    p95_duration = durations[p95_idx] if p95_idx < len(durations) else durations[-1]
                    p99_duration = durations[p99_idx] if p99_idx < len(durations) else durations[-1]

                # 存储指标
                db = get_task_db()
                try:
                    metric = QueueMetrics(
                        queue_name=queue_name,
                        pending_count=pending_count,
                        active_count=active_tasks,
                        succeeded_count=succeeded_count,
                        failed_count=failed_count,
                        avg_duration=avg_duration,
                        min_duration=min_duration,
                        max_duration=max_duration,
                        p95_duration=p95_duration,
                        p99_duration=p99_duration,
                        worker_count=worker_count,
                        time_window_minutes=5,
                    )
                    db.add(metric)
                    db.commit()
                    metrics_collected.append(queue_name)
                finally:
                    db.close()

            except Exception as e:
                logger.error(f"Failed to collect metrics for queue {queue_name}: {e}")

        logger.info(f"Collected metrics for {len(metrics_collected)} queues")

    except Exception as e:
        logger.error(f"Queue metrics collection failed: {e}")


@shared_task(name="app.tasks.queue_monitor_tasks.check_queue_alerts_task")
def check_queue_alerts_task():
    """
    检查队列告警任务

    每5分钟执行一次，检查队列状态并触发告警
    告警会自动发送邮件给管理员（在通知邮箱列表中配置）
    """
    logger.info("Starting queue alerts check")

    try:
        from app.celery_app import celery_app

        redis_client = get_queue_monitor_redis()

        # 获取Worker状态
        inspect = celery_app.control.inspect(timeout=2.0)
        ping = inspect.ping() or {}
        worker_count = len(ping)

        # 1. 检查Worker离线
        if worker_count == 0:
            create_and_send_alert(
                alert_type="worker_offline",
                title="所有Worker离线",
                message="检测到所有Celery Worker都已离线，请检查Worker服务状态",
                severity="critical",
            )
        else:
            # Worker恢复在线，自动解决告警
            auto_resolve_alerts("worker_offline")

        # 2. 检查各队列状态
        for queue_name in QUEUE_MONITOR_QUEUE_NAMES:
            try:
                # 获取队列长度
                if queue_name == "default":
                    queue_keys = ["celery:default", "celery"]
                else:
                    queue_keys = [f"celery:{queue_name}"]

                pending_count = 0
                for key in queue_keys:
                    try:
                        pending_count += redis_client.llen(key)
                    except Exception:
                        pass

                # 检查队列积压
                if pending_count >= ALERT_THRESHOLDS["queue_backlog_critical"]:
                    create_and_send_alert(
                        alert_type="queue_backlog",
                        title=f"队列 [{queue_name}] 严重积压",
                        message=f"队列 [{queue_name}] 当前有 {pending_count} 个待处理任务，超过严重阈值 {ALERT_THRESHOLDS['queue_backlog_critical']}",
                        severity="critical",
                        queue_name=queue_name,
                        current_value=pending_count,
                        threshold_value=ALERT_THRESHOLDS["queue_backlog_critical"],
                    )
                elif pending_count >= ALERT_THRESHOLDS["queue_backlog_warning"]:
                    create_and_send_alert(
                        alert_type="queue_backlog",
                        title=f"队列 [{queue_name}] 积压警告",
                        message=f"队列 [{queue_name}] 当前有 {pending_count} 个待处理任务，超过警告阈值 {ALERT_THRESHOLDS['queue_backlog_warning']}",
                        severity="warning",
                        queue_name=queue_name,
                        current_value=pending_count,
                        threshold_value=ALERT_THRESHOLDS["queue_backlog_warning"],
                    )
                else:
                    # 队列积压恢复正常，自动解决告警
                    auto_resolve_alerts("queue_backlog", queue_name)

                # 3. 检查失败率
                now_ts = datetime.utcnow().timestamp()
                hour_ago = now_ts - 3600

                succeeded_hour = redis_client.zcount(
                    build_completed_key("succeeded"),
                    hour_ago,
                    now_ts
                )
                failed_hour = redis_client.zcount(
                    build_completed_key("failed"),
                    hour_ago,
                    now_ts
                )

                total_hour = succeeded_hour + failed_hour
                if total_hour > 10:  # 至少有10个样本才统计
                    failure_rate = (failed_hour / total_hour) * 100

                    if failure_rate >= ALERT_THRESHOLDS["failure_rate_critical"]:
                        create_and_send_alert(
                            alert_type="high_failure_rate",
                            title=f"队列 [{queue_name}] 失败率严重",
                            message=f"队列 [{queue_name}] 最近1小时失败率为 {failure_rate:.1f}%，超过严重阈值 {ALERT_THRESHOLDS['failure_rate_critical']}%",
                            severity="critical",
                            queue_name=queue_name,
                            current_value=failure_rate,
                            threshold_value=ALERT_THRESHOLDS["failure_rate_critical"],
                            extra_data={"succeeded": succeeded_hour, "failed": failed_hour},
                        )
                    elif failure_rate >= ALERT_THRESHOLDS["failure_rate_warning"]:
                        create_and_send_alert(
                            alert_type="high_failure_rate",
                            title=f"队列 [{queue_name}] 失败率警告",
                            message=f"队列 [{queue_name}] 最近1小时失败率为 {failure_rate:.1f}%，超过警告阈值 {ALERT_THRESHOLDS['failure_rate_warning']}%",
                            severity="warning",
                            queue_name=queue_name,
                            current_value=failure_rate,
                            threshold_value=ALERT_THRESHOLDS["failure_rate_warning"],
                            extra_data={"succeeded": succeeded_hour, "failed": failed_hour},
                        )
                    else:
                        # 失败率恢复正常，自动解决告警
                        auto_resolve_alerts("high_failure_rate", queue_name)

            except Exception as e:
                logger.error(f"Failed to check alerts for queue {queue_name}: {e}")

        # 4. 检查长时间运行的任务
        if ping:
            active = inspect.active() or {}
            now = datetime.utcnow()

            for worker, tasks in active.items():
                for task in tasks:
                    time_start = task.get("time_start")
                    if time_start:
                        try:
                            start_dt = datetime.fromtimestamp(time_start)
                            running_minutes = (now - start_dt).total_seconds() / 60

                            if running_minutes >= ALERT_THRESHOLDS["long_running_task_minutes"]:
                                queue = task.get("delivery_info", {}).get("routing_key", "unknown")
                                create_and_send_alert(
                                    alert_type="long_running_task",
                                    title=f"检测到长时间运行的任务",
                                    message=f"任务 {task.get('name')} (ID: {task.get('id')}) 已运行 {running_minutes:.0f} 分钟，超过阈值 {ALERT_THRESHOLDS['long_running_task_minutes']} 分钟",
                                    severity="warning",
                                    queue_name=queue,
                                    current_value=running_minutes,
                                    threshold_value=ALERT_THRESHOLDS["long_running_task_minutes"],
                                    extra_data={
                                        "task_id": task.get("id"),
                                        "task_name": task.get("name"),
                                        "worker": worker,
                                    },
                                )
                        except (ValueError, TypeError) as e:
                            logger.debug(f"Failed to parse task time: {e}")

    except Exception as e:
        logger.error(f"Queue alerts check failed: {e}")


@shared_task(name="app.tasks.queue_monitor_tasks.cleanup_old_metrics_task")
def cleanup_old_metrics_task():
    """
    清理旧的队列指标数据

    保留最近30天的数据，删除更早的数据
    """
    logger.info("Starting old metrics cleanup")

    try:
        db = get_task_db()
        try:
            cutoff_date = datetime.utcnow() - timedelta(days=30)

            delete_query = select(QueueMetrics).where(
                QueueMetrics.recorded_at < cutoff_date
            )
            result = db.execute(delete_query)
            old_metrics = result.scalars().all()

            count = len(old_metrics)
            for metric in old_metrics:
                db.delete(metric)

            db.commit()
            logger.info(f"Cleaned up {count} old metric records")

        finally:
            db.close()

    except Exception as e:
        logger.error(f"Metrics cleanup failed: {e}")


@shared_task(name="app.tasks.queue_monitor_tasks.cleanup_old_alerts_task")
def cleanup_old_alerts_task():
    """
    清理旧的已解决告警

    保留最近90天的已解决告警
    """
    logger.info("Starting old alerts cleanup")

    try:
        db = get_task_db()
        try:
            cutoff_date = datetime.utcnow() - timedelta(days=90)

            delete_query = select(QueueAlert).where(
                and_(
                    QueueAlert.status == "resolved",
                    QueueAlert.resolved_at < cutoff_date,
                )
            )
            result = db.execute(delete_query)
            old_alerts = result.scalars().all()

            count = len(old_alerts)
            for alert in old_alerts:
                db.delete(alert)

            db.commit()
            logger.info(f"Cleaned up {count} old alert records")

        finally:
            db.close()

    except Exception as e:
        logger.error(f"Alerts cleanup failed: {e}")
