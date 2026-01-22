"""
告警服务 - 系统资源和 Token 告警
支持冷却期管理和美观邮件模板
"""
import logging
from enum import Enum
from datetime import datetime
from typing import Optional

from app.config import get_settings
from app.services.email_service import send_email, _email_wrapper, _container, _header, _content

logger = logging.getLogger(__name__)
settings = get_settings()

# 冷却期缓存（使用内存，重启后重置）
# 格式: {alert_key: last_sent_timestamp}
_alert_cooldown_cache: dict[str, datetime] = {}
COOLDOWN_HOURS = 2

# 队列告警冷却时间（秒）
QUEUE_ALERT_COOLDOWN_SECONDS = 3600  # 1小时
_queue_alert_cooldown_cache: dict[str, datetime] = {}


class AlertType(Enum):
    """告警类型枚举"""
    CPU_WARNING = "cpu_warning"       # CPU 80%
    CPU_CRITICAL = "cpu_critical"     # CPU 90%
    MEMORY_WARNING = "memory_warning"   # 内存 80%
    MEMORY_CRITICAL = "memory_critical" # 内存 90%
    DISK_WARNING = "disk_warning"       # 硬盘 80%
    DISK_CRITICAL = "disk_critical"     # 硬盘 90%
    TOKEN_EXHAUSTED = "token_exhausted" # Token 额度耗尽
    TOKEN_FAILED = "token_failed"       # Token 认证失败


def _get_alert_key(alert_type: AlertType, identifier: str = "") -> str:
    """生成告警唯一键"""
    return f"{alert_type.value}:{identifier}" if identifier else alert_type.value


def should_send_alert(alert_type: AlertType, identifier: str = "") -> bool:
    """检查是否应该发送告警（冷却期检查）"""
    key = _get_alert_key(alert_type, identifier)
    last_sent = _alert_cooldown_cache.get(key)
    
    if last_sent is None:
        return True
    
    elapsed = (datetime.utcnow() - last_sent).total_seconds()
    return elapsed >= COOLDOWN_HOURS * 3600


def mark_alert_sent(alert_type: AlertType, identifier: str = "") -> None:
    """标记告警已发送"""
    key = _get_alert_key(alert_type, identifier)
    _alert_cooldown_cache[key] = datetime.utcnow()


def get_notification_emails_sync() -> list[str]:
    """同步获取通知邮箱列表（从配置或数据库）"""
    # 优先使用环境变量配置
    if settings.admin_notification_emails:
        return [e.strip() for e in settings.admin_notification_emails.split(',') if e.strip()]
    return settings.admin_emails_list


def get_notification_emails_from_db() -> list[str]:
    """从数据库获取通知邮箱列表（用于队列告警）"""
    try:
        from app.tasks.base import get_task_db
        from app.models.notification_email import NotificationEmail
        from sqlalchemy import select

        db = get_task_db()
        try:
            result = db.execute(
                select(NotificationEmail.email)
                .where(NotificationEmail.is_active == True)
            )
            emails = [row[0] for row in result.all()]
            return emails if emails else get_notification_emails_sync()
        finally:
            db.close()
    except Exception as e:
        logger.warning(f"Failed to get notification emails from db: {e}, using fallback")
        return get_notification_emails_sync()


def _get_queue_alert_key(alert_type: str, queue_name: str = "") -> str:
    """生成队列告警唯一键"""
    return f"queue:{alert_type}:{queue_name}" if queue_name else f"queue:{alert_type}"


def should_send_queue_alert(alert_type: str, queue_name: str = "") -> bool:
    """检查是否应该发送队列告警（冷却期检查）"""
    key = _get_queue_alert_key(alert_type, queue_name)
    last_sent = _queue_alert_cooldown_cache.get(key)

    if last_sent is None:
        return True

    elapsed = (datetime.utcnow() - last_sent).total_seconds()
    return elapsed >= QUEUE_ALERT_COOLDOWN_SECONDS


def mark_queue_alert_sent(alert_type: str, queue_name: str = "") -> None:
    """标记队列告警已发送"""
    key = _get_queue_alert_key(alert_type, queue_name)
    _queue_alert_cooldown_cache[key] = datetime.utcnow()


def _build_queue_backlog_alert_email(queue_name: str, pending_count: int, threshold: int, severity: str) -> tuple[str, str]:
    """构建队列积压告警邮件"""
    is_critical = severity == "critical"
    level = "严重" if is_critical else "警告"
    color = "#ef4444" if is_critical else "#f59e0b"

    subject = f"【队列监控】队列 [{queue_name}] 积压{level} - {pending_count} 个任务"

    content = _header("📨", f"队列 [{queue_name}] 积压{level}", f"队列中待处理任务数已达到 {pending_count} 个")
    content += _content(f"""
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin: 20px 0;">
    <tr>
        <td style="background-color: #f9fafb; border-radius: 10px; padding: 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                    <td width="50%" style="text-align: center; padding: 16px;">
                        <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #6b7280;">当前积压</p>
                        <p style="margin: 8px 0 0 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 36px; font-weight: 700; color: {color};">{pending_count}</p>
                    </td>
                    <td width="50%" style="text-align: center; padding: 16px; border-left: 1px solid #e5e7eb;">
                        <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #6b7280;">告警阈值</p>
                        <p style="margin: 8px 0 0 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 36px; font-weight: 700; color: #374151;">{threshold}</p>
                    </td>
                </tr>
            </table>
        </td>
    </tr>
</table>
<table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr>
        <td style="background-color: {'#fef2f2' if is_critical else '#fffbeb'}; border-radius: 10px; padding: 16px; border-left: 4px solid {color};">
            <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; color: #374151;">
                <strong>建议操作：</strong>{"请立即检查 Worker 状态，考虑增加 Worker 数量或检查任务执行效率" if is_critical else "请关注队列处理情况，必要时增加 Worker 处理能力"}
            </p>
        </td>
    </tr>
</table>
<p style="margin: 20px 0 0 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #9ca3af; text-align: center;">
    告警时间: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC
</p>
""")

    html = _email_wrapper(_container(content, width=520))
    return subject, html


def _build_failure_rate_alert_email(queue_name: str, failure_rate: float, threshold: int, succeeded: int, failed: int, severity: str) -> tuple[str, str]:
    """构建失败率告警邮件"""
    is_critical = severity == "critical"
    level = "严重" if is_critical else "警告"
    color = "#ef4444" if is_critical else "#f59e0b"

    subject = f"【队列监控】队列 [{queue_name}] 失败率{level} - {failure_rate:.1f}%"

    content = _header("⚠️", f"队列 [{queue_name}] 失败率{level}", f"最近1小时任务失败率为 {failure_rate:.1f}%")
    content += _content(f"""
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin: 20px 0;">
    <tr>
        <td style="background-color: #f9fafb; border-radius: 10px; padding: 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                    <td width="33%" style="text-align: center; padding: 12px;">
                        <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #6b7280;">失败率</p>
                        <p style="margin: 8px 0 0 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 28px; font-weight: 700; color: {color};">{failure_rate:.1f}%</p>
                    </td>
                    <td width="33%" style="text-align: center; padding: 12px; border-left: 1px solid #e5e7eb;">
                        <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #6b7280;">成功任务</p>
                        <p style="margin: 8px 0 0 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 28px; font-weight: 700; color: #10b981;">{succeeded}</p>
                    </td>
                    <td width="33%" style="text-align: center; padding: 12px; border-left: 1px solid #e5e7eb;">
                        <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #6b7280;">失败任务</p>
                        <p style="margin: 8px 0 0 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 28px; font-weight: 700; color: #ef4444;">{failed}</p>
                    </td>
                </tr>
            </table>
        </td>
    </tr>
</table>
<table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr>
        <td style="background-color: {'#fef2f2' if is_critical else '#fffbeb'}; border-radius: 10px; padding: 16px; border-left: 4px solid {color};">
            <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; color: #374151;">
                <strong>建议操作：</strong>请检查任务失败原因，查看错误日志并修复问题
            </p>
        </td>
    </tr>
</table>
<p style="margin: 20px 0 0 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #9ca3af; text-align: center;">
    告警时间: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC
</p>
""")

    html = _email_wrapper(_container(content, width=560))
    return subject, html


def _build_worker_offline_alert_email() -> tuple[str, str]:
    """构建 Worker 离线告警邮件"""
    subject = "【队列监控】所有 Celery Worker 已离线"

    content = _header("🔴", "Worker 全部离线", "检测到所有 Celery Worker 都已离线")
    content += _content(f"""
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin: 20px 0;">
    <tr>
        <td style="background-color: #fef2f2; border-radius: 10px; padding: 24px; border: 1px solid #fecaca;">
            <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; color: #374151; text-align: center;">
                <strong style="color: #ef4444; font-size: 18px;">⚠️ 所有 Worker 离线</strong>
            </p>
            <p style="margin: 12px 0 0 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; color: #6b7280; text-align: center;">
                后台任务处理服务已停止
            </p>
        </td>
    </tr>
</table>
<table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr>
        <td style="background-color: #f0fdf4; border-radius: 10px; padding: 16px; border-left: 4px solid #10b981;">
            <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; color: #374151;">
                <strong>建议操作：</strong>请立即检查 Celery Worker 服务状态，重启 Worker 进程
            </p>
        </td>
    </tr>
</table>
<p style="margin: 20px 0 0 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #9ca3af; text-align: center;">
    告警时间: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC
</p>
""")

    html = _email_wrapper(_container(content, width=480))
    return subject, html


def _build_long_running_task_alert_email(task_name: str, task_id: str, running_minutes: float, queue: str, worker: str) -> tuple[str, str]:
    """构建长时间运行任务告警邮件"""
    # 任务ID脱敏
    masked_id = f"{task_id[:8]}...{task_id[-4:]}" if len(task_id) > 12 else task_id

    subject = f"【队列监控】检测到长时间运行的任务 - {task_name}"

    content = _header("⏱️", "长时间运行任务", f"任务已运行 {running_minutes:.0f} 分钟")
    content += _content(f"""
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin: 20px 0;">
    <tr>
        <td style="background-color: #f9fafb; border-radius: 10px; padding: 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                    <td style="padding: 8px 0;">
                        <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #6b7280;">任务名称</p>
                        <p style="margin: 4px 0 0 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 16px; font-weight: 600; color: #1f2937;">{task_name}</p>
                    </td>
                </tr>
                <tr>
                    <td style="padding: 8px 0;">
                        <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #6b7280;">任务 ID</p>
                        <p style="margin: 4px 0 0 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; font-weight: 500; color: #374151; font-family: monospace;">{masked_id}</p>
                    </td>
                </tr>
                <tr>
                    <td style="padding: 8px 0;">
                        <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #6b7280;">队列</p>
                        <p style="margin: 4px 0 0 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; color: #374151;">{queue}</p>
                    </td>
                </tr>
                <tr>
                    <td style="padding: 8px 0;">
                        <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #6b7280;">Worker</p>
                        <p style="margin: 4px 0 0 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; color: #374151;">{worker}</p>
                    </td>
                </tr>
            </table>
        </td>
    </tr>
</table>
<table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr>
        <td style="background-color: #fffbeb; border-radius: 10px; padding: 16px; border-left: 4px solid #f59e0b;">
            <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; color: #374151;">
                <strong>建议操作：</strong>请检查任务是否正常执行，必要时重启任务或优化代码
            </p>
        </td>
    </tr>
</table>
<p style="margin: 20px 0 0 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #9ca3af; text-align: center;">
    告警时间: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC
</p>
""")

    html = _email_wrapper(_container(content, width=520))
    return subject, html


# ========== 队列告警发送函数 ==========

def send_queue_backlog_alert(queue_name: str, pending_count: int, threshold: int, severity: str = "warning") -> bool:
    """发送队列积压告警"""
    if not should_send_queue_alert("queue_backlog", queue_name):
        logger.debug(f"队列积压告警冷却中: {queue_name}")
        return False

    emails = get_notification_emails_from_db()
    if not emails:
        logger.warning("无通知邮箱配置，跳过队列积压告警")
        return False

    subject, html = _build_queue_backlog_alert_email(queue_name, pending_count, threshold, severity)

    for email in emails:
        try:
            send_email(email, subject, html)
        except Exception as e:
            logger.error(f"发送队列积压告警邮件失败: {e}")

    mark_queue_alert_sent("queue_backlog", queue_name)
    logger.info(f"队列积压告警已发送: {queue_name} - {pending_count} 个任务")
    return True


def send_failure_rate_alert(queue_name: str, failure_rate: float, threshold: int, succeeded: int, failed: int, severity: str = "warning") -> bool:
    """发送失败率告警"""
    if not should_send_queue_alert("high_failure_rate", queue_name):
        logger.debug(f"失败率告警冷却中: {queue_name}")
        return False

    emails = get_notification_emails_from_db()
    if not emails:
        logger.warning("无通知邮箱配置，跳过失败率告警")
        return False

    subject, html = _build_failure_rate_alert_email(queue_name, failure_rate, threshold, succeeded, failed, severity)

    for email in emails:
        try:
            send_email(email, subject, html)
        except Exception as e:
            logger.error(f"发送失败率告警邮件失败: {e}")

    mark_queue_alert_sent("high_failure_rate", queue_name)
    logger.info(f"失败率告警已发送: {queue_name} - {failure_rate:.1f}%")
    return True


def send_worker_offline_alert() -> bool:
    """发送 Worker 离线告警"""
    if not should_send_queue_alert("worker_offline"):
        logger.debug("Worker 离线告警冷却中")
        return False

    emails = get_notification_emails_from_db()
    if not emails:
        logger.warning("无通知邮箱配置，跳过 Worker 离线告警")
        return False

    subject, html = _build_worker_offline_alert_email()

    for email in emails:
        try:
            send_email(email, subject, html)
        except Exception as e:
            logger.error(f"发送 Worker 离线告警邮件失败: {e}")

    mark_queue_alert_sent("worker_offline")
    logger.info("Worker 离线告警已发送")
    return True


def send_long_running_task_alert(task_name: str, task_id: str, running_minutes: float, queue: str, worker: str) -> bool:
    """发送长时间运行任务告警"""
    alert_key = f"long_running:{task_id}"
    if not should_send_queue_alert("long_running_task", alert_key):
        logger.debug(f"长时间运行任务告警冷却中: {task_id}")
        return False

    emails = get_notification_emails_from_db()
    if not emails:
        logger.warning("无通知邮箱配置，跳过长时间运行任务告警")
        return False

    subject, html = _build_long_running_task_alert_email(task_name, task_id, running_minutes, queue, worker)

    for email in emails:
        try:
            send_email(email, subject, html)
        except Exception as e:
            logger.error(f"发送长时间运行任务告警邮件失败: {e}")

    mark_queue_alert_sent("long_running_task", alert_key)
    logger.info(f"长时间运行任务告警已发送: {task_name} - {running_minutes:.0f} 分钟")
    return True


# ========== 邮件模板 ==========

def _build_cpu_alert_email(usage: float, threshold: int) -> tuple[str, str]:
    """构建 CPU 告警邮件"""
    is_critical = threshold >= 90
    level = "严重" if is_critical else "警告"
    color = "#ef4444" if is_critical else "#f59e0b"
    
    subject = f"【DEAI告警】服务器 CPU 使用率{level} - {usage:.1f}%"
    
    content = _header("🖥️", f"CPU 使用率{level}", f"服务器 CPU 使用率已达到 {usage:.1f}%")
    content += _content(f"""
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin: 20px 0;">
    <tr>
        <td style="background-color: #f9fafb; border-radius: 10px; padding: 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                    <td width="50%" style="text-align: center; padding: 16px;">
                        <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #6b7280;">当前使用率</p>
                        <p style="margin: 8px 0 0 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 36px; font-weight: 700; color: {color};">{usage:.1f}%</p>
                    </td>
                    <td width="50%" style="text-align: center; padding: 16px; border-left: 1px solid #e5e7eb;">
                        <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #6b7280;">告警阈值</p>
                        <p style="margin: 8px 0 0 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 36px; font-weight: 700; color: #374151;">{threshold}%</p>
                    </td>
                </tr>
            </table>
        </td>
    </tr>
</table>
<table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr>
        <td style="background-color: {'#fef2f2' if is_critical else '#fffbeb'}; border-radius: 10px; padding: 16px; border-left: 4px solid {color};">
            <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; color: #374151;">
                <strong>建议操作：</strong>{"请立即检查服务器负载，考虑扩容或优化进程" if is_critical else "请关注服务器负载情况，必要时进行优化"}
            </p>
        </td>
    </tr>
</table>
<p style="margin: 20px 0 0 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #9ca3af; text-align: center;">
    告警时间: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC
</p>
""")
    
    html = _email_wrapper(_container(content, width=520))
    return subject, html


def _build_memory_alert_email(usage: float, threshold: int, total_gb: float, used_gb: float) -> tuple[str, str]:
    """构建内存告警邮件"""
    is_critical = threshold >= 90
    level = "严重" if is_critical else "警告"
    color = "#ef4444" if is_critical else "#f59e0b"
    
    subject = f"【DEAI告警】服务器内存使用率{level} - {usage:.1f}%"
    
    content = _header("💾", f"内存使用率{level}", f"服务器内存使用率已达到 {usage:.1f}%")
    content += _content(f"""
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin: 20px 0;">
    <tr>
        <td style="background-color: #f9fafb; border-radius: 10px; padding: 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                    <td width="33%" style="text-align: center; padding: 12px;">
                        <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #6b7280;">当前使用率</p>
                        <p style="margin: 8px 0 0 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 28px; font-weight: 700; color: {color};">{usage:.1f}%</p>
                    </td>
                    <td width="33%" style="text-align: center; padding: 12px; border-left: 1px solid #e5e7eb;">
                        <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #6b7280;">已用内存</p>
                        <p style="margin: 8px 0 0 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 28px; font-weight: 700; color: #374151;">{used_gb:.1f}G</p>
                    </td>
                    <td width="33%" style="text-align: center; padding: 12px; border-left: 1px solid #e5e7eb;">
                        <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #6b7280;">总内存</p>
                        <p style="margin: 8px 0 0 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 28px; font-weight: 700; color: #374151;">{total_gb:.1f}G</p>
                    </td>
                </tr>
            </table>
        </td>
    </tr>
</table>
<table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr>
        <td style="background-color: {'#fef2f2' if is_critical else '#fffbeb'}; border-radius: 10px; padding: 16px; border-left: 4px solid {color};">
            <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; color: #374151;">
                <strong>建议操作：</strong>{"请立即检查内存占用，清理缓存或重启服务" if is_critical else "请关注内存使用情况，排查内存泄漏"}
            </p>
        </td>
    </tr>
</table>
<p style="margin: 20px 0 0 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #9ca3af; text-align: center;">
    告警时间: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC
</p>
""")
    
    html = _email_wrapper(_container(content, width=520))
    return subject, html


def _build_disk_alert_email(usage: float, threshold: int, total_gb: float, used_gb: float, free_gb: float) -> tuple[str, str]:
    """构建硬盘告警邮件"""
    is_critical = threshold >= 90
    level = "严重" if is_critical else "警告"
    color = "#ef4444" if is_critical else "#f59e0b"
    
    subject = f"【DEAI告警】服务器硬盘空间{level} - {usage:.1f}%"
    
    content = _header("💿", f"硬盘空间{level}", f"服务器硬盘使用率已达到 {usage:.1f}%")
    content += _content(f"""
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin: 20px 0;">
    <tr>
        <td style="background-color: #f9fafb; border-radius: 10px; padding: 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                    <td width="25%" style="text-align: center; padding: 12px;">
                        <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #6b7280;">使用率</p>
                        <p style="margin: 8px 0 0 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 24px; font-weight: 700; color: {color};">{usage:.1f}%</p>
                    </td>
                    <td width="25%" style="text-align: center; padding: 12px; border-left: 1px solid #e5e7eb;">
                        <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #6b7280;">已用空间</p>
                        <p style="margin: 8px 0 0 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 24px; font-weight: 700; color: #374151;">{used_gb:.0f}G</p>
                    </td>
                    <td width="25%" style="text-align: center; padding: 12px; border-left: 1px solid #e5e7eb;">
                        <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #6b7280;">剩余空间</p>
                        <p style="margin: 8px 0 0 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 24px; font-weight: 700; color: {'#ef4444' if free_gb < 10 else '#10b981'};">{free_gb:.0f}G</p>
                    </td>
                    <td width="25%" style="text-align: center; padding: 12px; border-left: 1px solid #e5e7eb;">
                        <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #6b7280;">总容量</p>
                        <p style="margin: 8px 0 0 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 24px; font-weight: 700; color: #374151;">{total_gb:.0f}G</p>
                    </td>
                </tr>
            </table>
        </td>
    </tr>
</table>
<table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr>
        <td style="background-color: {'#fef2f2' if is_critical else '#fffbeb'}; border-radius: 10px; padding: 16px; border-left: 4px solid {color};">
            <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; color: #374151;">
                <strong>建议操作：</strong>{"请立即清理磁盘空间，删除日志或临时文件" if is_critical else "请关注磁盘使用情况，定期清理不必要的文件"}
            </p>
        </td>
    </tr>
</table>
<p style="margin: 20px 0 0 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #9ca3af; text-align: center;">
    告警时间: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC
</p>
""")
    
    html = _email_wrapper(_container(content, width=560))
    return subject, html


def _build_token_exhausted_email(token_name: str, token_id: str, error_msg: str) -> tuple[str, str]:
    """构建 Token 额度耗尽告警邮件"""
    subject = f"【DEAI告警】API Token 额度已耗尽 - {token_name}"
    
    # Token ID 脱敏
    masked_id = f"{token_id[:8]}...{token_id[-4:]}" if len(token_id) > 12 else token_id
    
    content = _header("🔑", "Token 额度已耗尽", f"Token「{token_name}」的 API 额度已用完")
    content += _content(f"""
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin: 20px 0;">
    <tr>
        <td style="background-color: #fef2f2; border-radius: 10px; padding: 24px; border: 1px solid #fecaca;">
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                    <td style="padding: 8px 0;">
                        <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #6b7280;">Token 名称</p>
                        <p style="margin: 4px 0 0 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 18px; font-weight: 600; color: #1f2937;">{token_name}</p>
                    </td>
                </tr>
                <tr>
                    <td style="padding: 8px 0;">
                        <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #6b7280;">Token ID</p>
                        <p style="margin: 4px 0 0 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; font-weight: 500; color: #374151; font-family: monospace;">{masked_id}</p>
                    </td>
                </tr>
                <tr>
                    <td style="padding: 8px 0;">
                        <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #6b7280;">错误信息</p>
                        <p style="margin: 4px 0 0 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; color: #ef4444;">{error_msg[:200] if error_msg else '额度不足'}</p>
                    </td>
                </tr>
            </table>
        </td>
    </tr>
</table>
<table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr>
        <td style="background-color: #f0fdf4; border-radius: 10px; padding: 16px; border-left: 4px solid #10b981;">
            <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; color: #374151;">
                <strong>建议操作：</strong>请及时充值该 API Key 或添加新的 Token 到池中
            </p>
        </td>
    </tr>
</table>
<p style="margin: 20px 0 0 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #9ca3af; text-align: center;">
    告警时间: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC
</p>
""")
    
    html = _email_wrapper(_container(content, width=520))
    return subject, html


def _build_token_failed_email(token_name: str, token_id: str, error_msg: str) -> tuple[str, str]:
    """构建 Token 认证失败告警邮件"""
    subject = f"【DEAI告警】API Token 认证失败 - {token_name}"
    
    # Token ID 脱敏
    masked_id = f"{token_id[:8]}...{token_id[-4:]}" if len(token_id) > 12 else token_id
    
    content = _header("⚠️", "Token 认证失败", f"Token「{token_name}」无法正常使用")
    content += _content(f"""
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin: 20px 0;">
    <tr>
        <td style="background-color: #fffbeb; border-radius: 10px; padding: 24px; border: 1px solid #fde68a;">
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                    <td style="padding: 8px 0;">
                        <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #6b7280;">Token 名称</p>
                        <p style="margin: 4px 0 0 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 18px; font-weight: 600; color: #1f2937;">{token_name}</p>
                    </td>
                </tr>
                <tr>
                    <td style="padding: 8px 0;">
                        <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #6b7280;">Token ID</p>
                        <p style="margin: 4px 0 0 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; font-weight: 500; color: #374151; font-family: monospace;">{masked_id}</p>
                    </td>
                </tr>
                <tr>
                    <td style="padding: 8px 0;">
                        <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #6b7280;">错误信息</p>
                        <p style="margin: 4px 0 0 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; color: #f59e0b;">{error_msg[:200] if error_msg else '认证失败'}</p>
                    </td>
                </tr>
            </table>
        </td>
    </tr>
</table>
<table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr>
        <td style="background-color: #f0fdf4; border-radius: 10px; padding: 16px; border-left: 4px solid #10b981;">
            <p style="margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; color: #374151;">
                <strong>建议操作：</strong>请检查 API Key 是否有效，或在控制台重新生成 Key
            </p>
        </td>
    </tr>
</table>
<p style="margin: 20px 0 0 0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #9ca3af; text-align: center;">
    告警时间: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC
</p>
""")
    
    html = _email_wrapper(_container(content, width=520))
    return subject, html


# ========== 发送告警函数 ==========

def send_cpu_alert(usage: float, threshold: int) -> bool:
    """发送 CPU 告警"""
    alert_type = AlertType.CPU_CRITICAL if threshold >= 90 else AlertType.CPU_WARNING
    
    if not should_send_alert(alert_type):
        logger.debug(f"CPU 告警冷却中，跳过发送")
        return False
    
    emails = get_notification_emails_sync()
    if not emails:
        logger.warning("无通知邮箱配置，跳过 CPU 告警")
        return False
    
    subject, html = _build_cpu_alert_email(usage, threshold)
    
    for email in emails:
        try:
            send_email(email, subject, html)
        except Exception as e:
            logger.error(f"发送 CPU 告警邮件失败: {e}")
    
    mark_alert_sent(alert_type)
    logger.info(f"CPU 告警已发送: {usage:.1f}% (阈值 {threshold}%)")
    return True


def send_memory_alert(usage: float, threshold: int, total_gb: float, used_gb: float) -> bool:
    """发送内存告警"""
    alert_type = AlertType.MEMORY_CRITICAL if threshold >= 90 else AlertType.MEMORY_WARNING
    
    if not should_send_alert(alert_type):
        logger.debug(f"内存告警冷却中，跳过发送")
        return False
    
    emails = get_notification_emails_sync()
    if not emails:
        logger.warning("无通知邮箱配置，跳过内存告警")
        return False
    
    subject, html = _build_memory_alert_email(usage, threshold, total_gb, used_gb)
    
    for email in emails:
        try:
            send_email(email, subject, html)
        except Exception as e:
            logger.error(f"发送内存告警邮件失败: {e}")
    
    mark_alert_sent(alert_type)
    logger.info(f"内存告警已发送: {usage:.1f}% (阈值 {threshold}%)")
    return True


def send_disk_alert(usage: float, threshold: int, total_gb: float, used_gb: float, free_gb: float) -> bool:
    """发送硬盘告警"""
    alert_type = AlertType.DISK_CRITICAL if threshold >= 90 else AlertType.DISK_WARNING
    
    if not should_send_alert(alert_type):
        logger.debug(f"硬盘告警冷却中，跳过发送")
        return False
    
    emails = get_notification_emails_sync()
    if not emails:
        logger.warning("无通知邮箱配置，跳过硬盘告警")
        return False
    
    subject, html = _build_disk_alert_email(usage, threshold, total_gb, used_gb, free_gb)
    
    for email in emails:
        try:
            send_email(email, subject, html)
        except Exception as e:
            logger.error(f"发送硬盘告警邮件失败: {e}")
    
    mark_alert_sent(alert_type)
    logger.info(f"硬盘告警已发送: {usage:.1f}% (阈值 {threshold}%)")
    return True


def send_token_exhausted_alert(token_name: str, token_id: str, error_msg: str = "") -> bool:
    """发送 Token 额度耗尽告警"""
    if not should_send_alert(AlertType.TOKEN_EXHAUSTED, token_id):
        logger.debug(f"Token 额度告警冷却中: {token_name}")
        return False
    
    emails = get_notification_emails_sync()
    if not emails:
        logger.warning("无通知邮箱配置，跳过 Token 额度告警")
        return False
    
    subject, html = _build_token_exhausted_email(token_name, token_id, error_msg)
    
    for email in emails:
        try:
            send_email(email, subject, html)
        except Exception as e:
            logger.error(f"发送 Token 额度告警邮件失败: {e}")
    
    mark_alert_sent(AlertType.TOKEN_EXHAUSTED, token_id)
    logger.info(f"Token 额度耗尽告警已发送: {token_name}")
    return True


def send_token_failed_alert(token_name: str, token_id: str, error_msg: str = "") -> bool:
    """发送 Token 认证失败告警"""
    if not should_send_alert(AlertType.TOKEN_FAILED, token_id):
        logger.debug(f"Token 失败告警冷却中: {token_name}")
        return False
    
    emails = get_notification_emails_sync()
    if not emails:
        logger.warning("无通知邮箱配置，跳过 Token 失败告警")
        return False
    
    subject, html = _build_token_failed_email(token_name, token_id, error_msg)
    
    for email in emails:
        try:
            send_email(email, subject, html)
        except Exception as e:
            logger.error(f"发送 Token 失败告警邮件失败: {e}")
    
    mark_alert_sent(AlertType.TOKEN_FAILED, token_id)
    logger.info(f"Token 认证失败告警已发送: {token_name}")
    return True
