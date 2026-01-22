"""
队列监控 API 路由

提供类似 Laravel Horizon 的队列监控功能：
- 队列状态概览
- 任务列表
- 任务详情
- 失败任务管理
"""
import json
import logging
import time
from datetime import datetime
from typing import Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.utils.redis_client import get_redis, get_celery_redis
from app.utils.security import get_admin_user
from app.utils.queue_monitor import (
    QUEUE_MONITOR_QUEUE_NAMES,
    QUEUE_MONITOR_STATUSES,
    QUEUE_TASKS_RECENT_KEY,
    QUEUE_TASK_MAX_ENTRIES,
    QUEUE_TASK_TTL_SECONDS,
    build_completed_key,
    build_status_key,
    build_task_key,
    merge_task_data,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["队列监控"])
CELERY_INSPECT_TIMEOUT_SECONDS = 1.0


def _normalize_status(status: Optional[str]) -> Optional[str]:
    if status is None:
        return None
    if status == "success":
        return "succeeded"
    if status == "failure":
        return "failed"
    return status


def _queue_keys_for(queue_name: str) -> list[str]:
    if queue_name == "default":
        return ["celery:default", "celery"]
    return [f"celery:{queue_name}"]


async def _get_queue_lengths(redis_client) -> Dict[str, int]:
    lengths: Dict[str, int] = {}
    for queue_name in QUEUE_MONITOR_QUEUE_NAMES:
        keys = _queue_keys_for(queue_name)
        total = 0
        for key in keys:
            total += await redis_client.llen(key)
        lengths[queue_name] = total
    return lengths


async def _fetch_tasks_from_store(
    redis_client,
    queue: Optional[str],
    status: Optional[str],
    limit: int,
    offset: int,
) -> Dict[str, Any]:
    status = _normalize_status(status)
    if status and status not in QUEUE_MONITOR_STATUSES:
        raise HTTPException(status_code=400, detail=f"未知任务状态: {status}")

    index_key = build_status_key(status) if status else QUEUE_TASKS_RECENT_KEY
    task_ids = await redis_client.zrevrange(index_key, 0, QUEUE_TASK_MAX_ENTRIES - 1)
    if not task_ids:
        return {"tasks": [], "total": 0}

    keys = [build_task_key(task_id) for task_id in task_ids]
    raw_tasks = await redis_client.mget(keys)
    tasks = []
    total = 0
    stale_ids = []
    for task_id, raw in zip(task_ids, raw_tasks):
        if not raw:
            stale_ids.append(task_id)
            continue
        try:
            task = json.loads(raw)
        except json.JSONDecodeError:
            stale_ids.append(task_id)
            continue
        task.setdefault("id", task_id)
        if status and task.get("status") != status:
            continue
        if queue and task.get("queue") != queue:
            continue
        total += 1
        if total <= offset:
            continue
        if len(tasks) < limit:
            tasks.append(task)
    if stale_ids:
        await redis_client.zrem(index_key, *stale_ids)
    return {"tasks": tasks, "total": total}


async def _read_task_from_store(redis_client, task_id: str) -> Optional[Dict[str, Any]]:
    raw = await redis_client.get(build_task_key(task_id))
    if not raw:
        return None
    try:
        task = json.loads(raw)
    except json.JSONDecodeError:
        return None
    task.setdefault("id", task_id)
    return task


async def _update_task_store(redis_client, task_id: str, updates: Dict[str, Any]) -> None:
    updates.setdefault("id", task_id)
    raw = await redis_client.get(build_task_key(task_id))
    existing = json.loads(raw) if raw else {}
    previous_status = existing.get("status")
    merged = merge_task_data(existing, updates)
    status = merged.get("status")
    pipe = redis_client.pipeline()
    pipe.set(build_task_key(task_id), json.dumps(merged, ensure_ascii=True))
    pipe.expire(build_task_key(task_id), QUEUE_TASK_TTL_SECONDS)
    pipe.zadd(QUEUE_TASKS_RECENT_KEY, {task_id: merged.get("updated_at_ts", time.time())})
    if status:
        pipe.zadd(build_status_key(status), {task_id: merged.get("updated_at_ts", time.time())})
    if previous_status and previous_status != status:
        pipe.zrem(build_status_key(previous_status), task_id)
    if status in {"succeeded", "failed"}:
        completed_ts = merged.get("time_done") or merged.get("updated_at_ts", time.time())
        pipe.zadd(build_completed_key(status), {task_id: completed_ts})
    await pipe.execute()

async def get_celery_stats(broker_redis=None, store_redis=None) -> Dict[str, Any]:
    """
    获取 Celery 统计信息

    返回队列状态、任务统计等
    """
    if broker_redis is None:
        broker_redis = await get_celery_redis()
    if store_redis is None:
        store_redis = await get_redis()

    stats = {
        "queues": {},
        "workers": {},
        "tasks": {
            "pending": 0,
            "active": 0,
            "failed": 0,
            "succeeded": 0,
        },
        "timestamp": datetime.utcnow().isoformat(),
    }

    try:
        from app.celery_app import celery_app

        stats["queues"] = await _get_queue_lengths(broker_redis)
        stats["tasks"]["pending"] = sum(stats["queues"].values())

        inspect = celery_app.control.inspect(timeout=CELERY_INSPECT_TIMEOUT_SECONDS)
        ping = inspect.ping() or {}
        stats["workers"]["count"] = len(ping)
        if ping:
            active = inspect.active() or {}
            stats["tasks"]["active"] = sum(len(tasks) for tasks in active.values())

        stats["tasks"]["failed"] = await store_redis.zcard(build_status_key("failed"))
        stats["tasks"]["succeeded"] = await store_redis.zcard(build_status_key("succeeded"))

    except Exception as e:
        logger.error(f"获取 Celery 统计失败: {e}")

    return stats


@router.get("/stats")
async def get_queue_stats(
    current_user = Depends(get_admin_user),
    broker_redis = Depends(get_celery_redis),
    store_redis = Depends(get_redis),
) -> Dict[str, Any]:
    """
    获取队列统计信息

    返回：
    - 各队列待处理任务数
    - 活跃 worker 数
    - 任务状态统计
    """
    return await get_celery_stats(broker_redis, store_redis)


@router.get("/workers")
async def get_workers(
    current_user = Depends(get_admin_user),
) -> Dict[str, Any]:
    """
    获取 Worker 列表及状态

    返回：
    - Worker 列表
    - 每个 Worker 的状态、当前任务等
    """
    workers = {
        "workers": [],
        "total": 0,
        "online": 0,
        "timestamp": datetime.utcnow().isoformat(),
    }

    try:
        from app.celery_app import celery_app

        inspect = celery_app.control.inspect(timeout=CELERY_INSPECT_TIMEOUT_SECONDS)
        ping = inspect.ping() or {}
        if ping:
            stats = inspect.stats() or {}
            active = inspect.active() or {}
        else:
            stats = {}
            active = {}

        worker_names = set(ping.keys()) | set(stats.keys()) | set(active.keys())
        workers["total"] = len(worker_names)
        workers["online"] = len([name for name in worker_names if name in ping or name in stats])

        for name in sorted(worker_names):
            workers["workers"].append({
                "name": name,
                "status": "online" if name in ping or name in stats else "offline",
                "active_tasks": len(active.get(name, [])),
            })

    except Exception as e:
        logger.error(f"获取 Worker 列表失败: {e}")

    return workers


@router.get("/tasks")
async def get_tasks(
    queue: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user = Depends(get_admin_user),
    store_redis = Depends(get_redis),
) -> Dict[str, Any]:
    """
    获取任务列表

    参数：
    - queue: 队列名称过滤
    - status: 状态过滤 (pending/active/failed/succeeded)
    - limit: 返回数量
    - offset: 偏移量
    """
    from app.celery_app import celery_app

    tasks = {
        "tasks": [],
        "total": 0,
        "queue": queue,
        "status": status,
    }

    try:
        normalized_status = _normalize_status(status)
        if normalized_status in {"active", "pending"}:
            inspect = celery_app.control.inspect(timeout=CELERY_INSPECT_TIMEOUT_SECONDS)
            if normalized_status == "active":
                active = inspect.active() or {}
                for worker, worker_tasks in active.items():
                    for task in worker_tasks:
                        if queue and task.get("delivery_info", {}).get("routing_key") != queue:
                            continue
                        tasks["tasks"].append({
                            "id": task.get("id"),
                            "name": task.get("name"),
                            "args": task.get("args"),
                            "kwargs": task.get("kwargs"),
                            "queue": task.get("delivery_info", {}).get("routing_key"),
                            "worker": worker,
                            "time_start": task.get("time_start"),
                            "status": "active",
                        })
            if normalized_status == "pending":
                reserved = inspect.reserved() or {}
                for worker, worker_tasks in reserved.items():
                    for task in worker_tasks:
                        if queue and task.get("delivery_info", {}).get("routing_key") != queue:
                            continue
                        tasks["tasks"].append({
                            "id": task.get("id"),
                            "name": task.get("name"),
                            "args": task.get("args"),
                            "kwargs": task.get("kwargs"),
                            "queue": task.get("delivery_info", {}).get("routing_key"),
                            "worker": worker,
                            "status": "pending",
                        })
            tasks["total"] = len(tasks["tasks"])
            tasks["tasks"] = tasks["tasks"][offset:offset + limit]
        else:
            store_result = await _fetch_tasks_from_store(
                store_redis,
                queue,
                normalized_status,
                limit,
                offset,
            )
            tasks["tasks"] = store_result["tasks"]
            tasks["total"] = store_result["total"]
            if normalized_status is None and not tasks["tasks"]:
                inspect = celery_app.control.inspect(timeout=CELERY_INSPECT_TIMEOUT_SECONDS)
                active = inspect.active() or {}
                reserved = inspect.reserved() or {}
                fallback = []
                for worker, worker_tasks in active.items():
                    for task in worker_tasks:
                        if queue and task.get("delivery_info", {}).get("routing_key") != queue:
                            continue
                        fallback.append({
                            "id": task.get("id"),
                            "name": task.get("name"),
                            "args": task.get("args"),
                            "kwargs": task.get("kwargs"),
                            "queue": task.get("delivery_info", {}).get("routing_key"),
                            "worker": worker,
                            "time_start": task.get("time_start"),
                            "status": "active",
                        })
                for worker, worker_tasks in reserved.items():
                    for task in worker_tasks:
                        if queue and task.get("delivery_info", {}).get("routing_key") != queue:
                            continue
                        fallback.append({
                            "id": task.get("id"),
                            "name": task.get("name"),
                            "args": task.get("args"),
                            "kwargs": task.get("kwargs"),
                            "queue": task.get("delivery_info", {}).get("routing_key"),
                            "worker": worker,
                            "status": "pending",
                        })
                tasks["tasks"] = fallback[offset:offset + limit]
                tasks["total"] = len(fallback)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取任务列表失败: {e}")

    return tasks


@router.get("/tasks/{task_id}")
async def get_task_detail(
    task_id: str,
    current_user = Depends(get_admin_user),
    store_redis = Depends(get_redis),
) -> Dict[str, Any]:
    """
    获取任务详情

    返回任务的完整信息，包括：
    - 任务状态
    - 执行结果
    - 错误信息（如果失败）
    - 执行时长
    """
    from app.celery_app import celery_app

    try:
        stored = await _read_task_from_store(store_redis, task_id)
        if stored:
            return {
                "id": task_id,
                "status": stored.get("status"),
                "result": stored.get("result"),
                "error": stored.get("error"),
                "traceback": stored.get("traceback"),
                "backend": "queue_monitor",
                "name": stored.get("name"),
                "queue": stored.get("queue"),
                "worker": stored.get("worker"),
                "args": stored.get("args"),
                "kwargs": stored.get("kwargs"),
                "time_start": stored.get("time_start"),
                "time_done": stored.get("time_done"),
                "duration": stored.get("duration"),
                "retries": stored.get("retries"),
            }

        result = celery_app.AsyncResult(task_id)

        return {
            "id": task_id,
            "status": result.state,
            "result": result.result if result.successful() else None,
            "error": str(result.info) if result.failed() else None,
            "traceback": result.traceback if result.failed() else None,
            "backend": str(result.backend),
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取任务详情失败: {e}")


@router.post("/tasks/{task_id}/retry")
async def retry_task(
    task_id: str,
    current_user = Depends(get_admin_user),
    store_redis = Depends(get_redis),
) -> Dict[str, Any]:
    """
    重试失败的任务

    将失败的任务重新放入队列执行
    """
    from app.celery_app import celery_app

    try:
        stored = await _read_task_from_store(store_redis, task_id)
        if not stored:
            raise HTTPException(status_code=404, detail="未找到任务记录，无法重试")

        if stored.get("status") != "failed":
            raise HTTPException(
                status_code=400,
                detail=f"任务状态为 {stored.get('status')}，无法重试",
            )

        task_name = stored.get("name")
        if not task_name:
            raise HTTPException(status_code=400, detail="任务缺少名称，无法重试")

        args = stored.get("args")
        kwargs = stored.get("kwargs")
        if args is None:
            args = []
        if kwargs is None:
            kwargs = {}
        if not isinstance(args, list) or not isinstance(kwargs, dict):
            raise HTTPException(status_code=400, detail="任务参数无法恢复，无法重试")
        queue_name = stored.get("queue")

        result = celery_app.send_task(task_name, args=args, kwargs=kwargs, queue=queue_name)

        await _update_task_store(
            store_redis,
            task_id,
            {
                "retry_requested_at": datetime.utcnow().timestamp(),
                "retry_task_id": result.id,
            },
        )

        return {
            "id": task_id,
            "status": "retry_requested",
            "message": "任务重试请求已提交",
            "retry_task_id": result.id,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"重试任务失败: {e}")


@router.delete("/tasks/{task_id}")
async def cancel_task(
    task_id: str,
    current_user = Depends(get_admin_user),
    store_redis = Depends(get_redis),
) -> Dict[str, Any]:
    """
    取消/删除任务

    取消待处理的任务或删除任务记录
    """
    from app.celery_app import celery_app

    try:
        # 撤销任务
        celery_app.control.revoke(task_id, terminate=True)

        await _update_task_store(
            store_redis,
            task_id,
            {
                "status": "revoked",
                "error": "revoked",
                "time_done": datetime.utcnow().timestamp(),
            },
        )

        return {
            "id": task_id,
            "status": "cancelled",
            "message": "任务已取消",
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"取消任务失败: {e}")


@router.post("/purge")
async def purge_queue(
    queue: str = Query(..., description="队列名称"),
    current_user = Depends(get_admin_user),
    broker_redis = Depends(get_celery_redis),
) -> Dict[str, Any]:
    """
    清空队列

    删除队列中所有待处理的任务
    """
    try:
        if queue not in QUEUE_MONITOR_QUEUE_NAMES:
            raise HTTPException(status_code=400, detail=f"未知队列: {queue}")

        keys = _queue_keys_for(queue)
        purged_count = 0
        for key in keys:
            purged_count += await broker_redis.llen(key)
        if keys:
            await broker_redis.delete(*keys)

        return {
            "queue": queue,
            "purged_count": purged_count,
            "message": f"队列 {queue} 已清空",
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"清空队列失败: {e}")


@router.post("/workers/pool_restart")
async def pool_restart(
    current_user = Depends(get_admin_user),
) -> Dict[str, Any]:
    """
    重启所有 Worker 进程

    执行优雅重启，让 worker 完成当前任务后重启
    """
    from app.celery_app import celery_app

    try:
        celery_app.control.pool_restart()

        return {
            "status": "restart_requested",
            "message": "Worker 重启请求已发送",
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"重启 Worker 失败: {e}")


@router.get("/dashboard")
async def get_dashboard(
    current_user = Depends(get_admin_user),
    broker_redis = Depends(get_celery_redis),
    store_redis = Depends(get_redis),
) -> Dict[str, Any]:
    """
    获取队列监控面板数据

    类似 Horizon 的仪表板视图，包含：
    - 队列状态概览
    - 最近任务
    - Worker 状态
    - 吞吐量统计
    """
    from app.celery_app import celery_app

    dashboard = {
        "overview": {
            "queues": {},
            "workers": {
                "total": 0,
                "online": 0,
            },
            "tasks": {
                "pending": 0,
                "active": 0,
                "failed": 0,
                "succeeded": 0,
            },
        },
        "recent_tasks": [],
        "workers": [],
        "throughput": {
            "last_hour": 0,
            "last_day": 0,
        },
        "timestamp": datetime.utcnow().isoformat(),
    }

    try:
        # 队列状态
        dashboard["overview"]["queues"] = await _get_queue_lengths(broker_redis)
        dashboard["overview"]["tasks"]["pending"] = sum(dashboard["overview"]["queues"].values())

        inspect = celery_app.control.inspect(timeout=CELERY_INSPECT_TIMEOUT_SECONDS)
        ping = inspect.ping() or {}
        if ping:
            stats = inspect.stats() or {}
            active = inspect.active() or {}
        else:
            stats = {}
            active = {}

        dashboard["overview"]["workers"]["total"] = len(set(active.keys()) | set(ping.keys()) | set(stats.keys()))
        dashboard["overview"]["workers"]["online"] = len(set(ping.keys()) | set(stats.keys()))
        dashboard["overview"]["tasks"]["active"] = sum(len(t) for t in active.values())

        dashboard["workers"] = [
            {"name": w, "active_tasks": len(t)}
            for w, t in active.items()
        ]

        # 最近任务（从队列监控存储取前 10 条）
        recent = await _fetch_tasks_from_store(store_redis, None, None, 10, 0)
        dashboard["recent_tasks"] = recent["tasks"]

        now_ts = time.time()
        hour_ago = now_ts - 3600
        day_ago = now_ts - 86400
        succeeded_hour = await store_redis.zcount(build_completed_key("succeeded"), hour_ago, now_ts)
        failed_hour = await store_redis.zcount(build_completed_key("failed"), hour_ago, now_ts)
        succeeded_day = await store_redis.zcount(build_completed_key("succeeded"), day_ago, now_ts)
        failed_day = await store_redis.zcount(build_completed_key("failed"), day_ago, now_ts)
        succeeded_total = await store_redis.zcard(build_status_key("succeeded"))
        failed_total = await store_redis.zcard(build_status_key("failed"))

        dashboard["throughput"]["last_hour"] = succeeded_hour + failed_hour
        dashboard["throughput"]["last_day"] = succeeded_day + failed_day
        dashboard["overview"]["tasks"]["succeeded"] = succeeded_total
        dashboard["overview"]["tasks"]["failed"] = failed_total

    except Exception as e:
        logger.error(f"获取仪表板数据失败: {e}")

    return dashboard


@router.get("/metrics/history")
async def get_metrics_history(
    queue: Optional[str] = None,
    hours: int = Query(24, ge=1, le=168),
    current_user = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """
    获取队列指标历史数据

    参数：
    - queue: 队列名称过滤
    - hours: 查询最近几小时的数据（1-168小时/7天）
    """
    from datetime import timedelta
    from app.models.queue_metrics import QueueMetrics
    from sqlalchemy import select

    since = datetime.utcnow() - timedelta(hours=hours)

    query = select(QueueMetrics).where(QueueMetrics.recorded_at >= since)

    if queue:
        query = query.where(QueueMetrics.queue_name == queue)

    query = query.order_by(QueueMetrics.recorded_at.desc())

    result = await db.execute(query)
    metrics = result.scalars().all()

    # 按队列分组
    by_queue: Dict[str, list[Dict]] = {}
    for m in metrics:
        qname = m.queue_name
        if qname not in by_queue:
            by_queue[qname] = []
        by_queue[qname].append(m.to_dict())

    # 计算统计汇总
    summary = {}
    for qname, items in by_queue.items():
        if items:
            avg_pending = sum(m["pending_count"] for m in items) / len(items)
            avg_active = sum(m["active_count"] for m in items) / len(items)
            total_succeeded = sum(m["succeeded_count"] for m in items)
            total_failed = sum(m["failed_count"] for m in items)
            avg_duration = sum(m["avg_duration"] or 0 for m in items) / len(items)

            summary[qname] = {
                "avg_pending": round(avg_pending, 2),
                "avg_active": round(avg_active, 2),
                "total_succeeded": total_succeeded,
                "total_failed": total_failed,
                "failure_rate": round(total_failed / max(1, total_succeeded + total_failed) * 100, 2),
                "avg_duration": round(avg_duration, 2),
                "data_points": len(items),
            }

    return {
        "by_queue": by_queue,
        "summary": summary,
        "time_range": {
            "hours": hours,
            "since": since.isoformat(),
            "until": datetime.utcnow().isoformat(),
        },
    }


@router.get("/alerts")
async def get_alerts(
    status: Optional[str] = None,
    severity: Optional[str] = None,
    alert_type: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """
    获取队列告警列表

    参数：
    - status: 状态过滤 (firing/resolved/acknowledged)
    - severity: 严重级别过滤 (info/warning/critical)
    - alert_type: 告警类型过滤
    - limit: 返回数量
    - offset: 偏移量
    """
    from app.models.queue_alert import QueueAlert
    from sqlalchemy import select, func, desc

    query = select(QueueAlert)

    if status:
        query = query.where(QueueAlert.status == status)
    if severity:
        query = query.where(QueueAlert.severity == severity)
    if alert_type:
        query = query.where(QueueAlert.alert_type == alert_type)

    # 统计总数
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = query.order_by(desc(QueueAlert.fired_at))
    query = query.offset(offset).limit(limit)

    result = await db.execute(query)
    alerts = result.scalars().all()

    # 统计活跃告警数
    firing_count_result = await db.execute(
        select(func.count()).where(QueueAlert.status == "firing")
    )
    firing_count = firing_count_result.scalar() or 0

    return {
        "items": [a.to_dict() for a in alerts],
        "total": total,
        "firing_count": firing_count,
        "limit": limit,
        "offset": offset,
    }


@router.post("/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(
    alert_id: str,
    notes: Optional[str] = None,
    current_user = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """
    确认告警
    """
    from app.models.queue_alert import QueueAlert
    from sqlalchemy import select

    result = await db.execute(
        select(QueueAlert).where(QueueAlert.id == alert_id)
    )
    alert = result.scalar_one_or_none()

    if not alert:
        raise HTTPException(status_code=404, detail="告警不存在")

    if alert.status != "firing":
        raise HTTPException(status_code=400, detail="只能确认活跃的告警")

    alert.status = "acknowledged"
    alert.acknowledged_by = current_user.id
    alert.acknowledged_at = datetime.utcnow()
    alert.notes = notes

    await db.commit()

    logger.info(f"Alert acknowledged: id={alert_id}, admin={current_user.id}")

    return {"message": "告警已确认", "alert": alert.to_dict()}


@router.post("/alerts/{alert_id}/resolve")
async def resolve_alert(
    alert_id: str,
    notes: Optional[str] = None,
    current_user = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """
    解决告警
    """
    from app.models.queue_alert import QueueAlert
    from sqlalchemy import select

    result = await db.execute(
        select(QueueAlert).where(QueueAlert.id == alert_id)
    )
    alert = result.scalar_one_or_none()

    if not alert:
        raise HTTPException(status_code=404, detail="告警不存在")

    if alert.status == "resolved":
        raise HTTPException(status_code=400, detail="告警已解决")

    alert.status = "resolved"
    alert.resolved_at = datetime.utcnow()
    if not alert.acknowledged_by:
        alert.acknowledged_by = current_user.id
        alert.acknowledged_at = datetime.utcnow()
    if notes:
        alert.notes = (alert.notes or "") + f"\n解决备注: {notes}"

    await db.commit()

    logger.info(f"Alert resolved: id={alert_id}, admin={current_user.id}")

    return {"message": "告警已解决", "alert": alert.to_dict()}


@router.get("/stats/summary")
async def get_queue_stats_summary(
    current_user = Depends(get_admin_user),
    broker_redis = Depends(get_celery_redis),
    store_redis = Depends(get_redis),
) -> Dict[str, Any]:
    """
    获取队列统计摘要

    包括：
    - 当前队列状态
    - 任务执行趋势
    - Worker健康状态
    - 性能指标
    """
    from app.celery_app import celery_app
    from datetime import timedelta

    summary = {
        "queues": {},
        "workers": {},
        "performance": {},
        "alerts": {},
        "timestamp": datetime.utcnow().isoformat(),
    }

    try:
        # 队列状态
        queue_lengths = await _get_queue_lengths(broker_redis)
        total_pending = sum(queue_lengths.values())

        summary["queues"] = {
            "pending_by_queue": queue_lengths,
            "total_pending": total_pending,
        }

        # 任务统计
        inspect = celery_app.control.inspect(timeout=CELERY_INSPECT_TIMEOUT_SECONDS)
        ping = inspect.ping() or {}
        worker_count = len(ping)

        active_tasks = 0
        if ping:
            active_data = inspect.active() or {}
            active_tasks = sum(len(tasks) for tasks in active_data.values())

        succeeded_total = await store_redis.zcard(build_status_key("succeeded"))
        failed_total = await store_redis.zcard(build_status_key("failed"))

        # 计算失败率
        total_completed = succeeded_total + failed_total
        failure_rate = round(failed_total / max(1, total_completed) * 100, 2)

        summary["workers"] = {
            "online_count": worker_count,
            "active_tasks": active_tasks,
        }

        summary["performance"] = {
            "succeeded_total": succeeded_total,
            "failed_total": failed_total,
            "failure_rate": failure_rate,
        }

        # 最近1小时的统计
        now_ts = time.time()
        hour_ago = now_ts - 3600
        succeeded_hour = await store_redis.zcount(build_completed_key("succeeded"), hour_ago, now_ts)
        failed_hour = await store_redis.zcount(build_completed_key("failed"), hour_ago, now_ts)

        summary["performance"]["throughput_last_hour"] = succeeded_hour + failed_hour
        summary["performance"]["success_rate_last_hour"] = round(
            succeeded_hour / max(1, succeeded_hour + failed_hour) * 100, 2
        )

    except Exception as e:
        logger.error(f"获取队列统计摘要失败: {e}")

    return summary


@router.get("/trends")
async def get_queue_trends(
    queue: Optional[str] = None,
    hours: int = Query(24, ge=1, le=168),
    current_user = Depends(get_admin_user),
    store_redis = Depends(get_redis),
) -> Dict[str, Any]:
    """
    获取队列趋势数据

    返回指定时间范围内的任务执行趋势
    """
    from datetime import timedelta

    now_ts = time.time()
    since_ts = now_ts - (hours * 3600)

    trends = {
        "queue": queue,
        "hours": hours,
        "time_series": [],
        "summary": {},
    }

    try:
        # 按小时统计
        interval = 3600  # 1小时
        for i in range(hours):
            interval_end = now_ts - (i * interval)
            interval_start = interval_end - interval

            succeeded = await store_redis.zcount(
                build_completed_key("succeeded"),
                interval_start,
                interval_end
            )
            failed = await store_redis.zcount(
                build_completed_key("failed"),
                interval_start,
                interval_end
            )

            trends["time_series"].append({
                "timestamp": datetime.fromtimestamp(interval_start).isoformat(),
                "succeeded": succeeded,
                "failed": failed,
                "total": succeeded + failed,
            })

        trends["time_series"].reverse()

        # 计算汇总
        total_succeeded = sum(t["succeeded"] for t in trends["time_series"])
        total_failed = sum(t["failed"] for t in trends["time_series"])
        total_tasks = total_succeeded + total_failed

        trends["summary"] = {
            "total_succeeded": total_succeeded,
            "total_failed": total_failed,
            "total_tasks": total_tasks,
            "avg_per_hour": round(total_tasks / hours, 2),
            "failure_rate": round(total_failed / max(1, total_tasks) * 100, 2),
        }

    except Exception as e:
        logger.error(f"获取队列趋势失败: {e}")

    return trends
