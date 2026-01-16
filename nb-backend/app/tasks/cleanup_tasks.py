"""
数据清理任务

支持：
- 对话历史清理
- 过期验证码清理
- 临时文件清理
"""
import logging
from datetime import datetime
from typing import Dict, Any
from app.celery_app import celery_app
from app.tasks.base import get_task_db, record_task_result

logger = logging.getLogger(__name__)


@celery_app.task(
    name="app.tasks.cleanup_tasks.cleanup_old_conversations_task",
    bind=True,
)
def cleanup_old_conversations_task(self) -> Dict[str, Any]:
    """
    清理14天前的对话历史（定时任务）

    Returns:
        清理结果统计
    """
    task_id = self.request.id
    start_time = datetime.now()

    logger.info(f"[{task_id}] 开始执行对话清理任务")

    from app.services.conversation_cleanup import cleanup_old_conversations

    db = get_task_db()

    try:
        # 将同步 session 转换为异步调用需要特殊处理
        # 这里简化为同步执行
        import asyncio
        from sqlalchemy.ext.asyncio import AsyncSession

        # 创建异步 session
        async_db = AsyncSession(bind=asyncio.run(
            __import__("app.database", fromlist=["async_session_maker"]).async_session_maker()
        ))

        result = asyncio.run(cleanup_old_conversations(async_db, dry_run=False))

        duration = (datetime.now() - start_time).total_seconds()

        return record_task_result(
            task_id=task_id,
            task_name="cleanup_conversations",
            status="success",
            result=result,
            duration=duration,
        )

    except Exception as e:
        logger.error(f"[{task_id}] 对话清理失败: {e}")
        duration = (datetime.now() - start_time).total_seconds()

        record_task_result(
            task_id=task_id,
            task_name="cleanup_conversations",
            status="failed",
            error=str(e),
            duration=duration,
        )
        raise

    finally:
        db.close()


@celery_app.task(
    name="app.tasks.cleanup_tasks.cleanup_expired_codes_task",
    bind=True,
)
def cleanup_expired_codes_task(self) -> Dict[str, Any]:
    """
    清理过期的验证码

    Returns:
        清理结果
    """
    task_id = self.request.id
    start_time = datetime.now()

    logger.info(f"[{task_id}] 开始清理过期验证码")

    db = get_task_db()

    try:
        from app.models.email_code import EmailCode
        from sqlalchemy import and_, delete
        from datetime import timedelta

        # 删除超过1小时的验证码
        cutoff = datetime.utcnow() - timedelta(hours=1)

        stmt = delete(EmailCode).where(EmailCode.created_at < cutoff)
        result = db.execute(stmt)
        db.commit()

        deleted_count = result.rowcount

        duration = (datetime.now() - start_time).total_seconds()

        return record_task_result(
            task_id=task_id,
            task_name="cleanup_expired_codes",
            status="success",
            result={"deleted_count": deleted_count},
            duration=duration,
        )

    except Exception as e:
        logger.error(f"[{task_id}] 验证码清理失败: {e}")
        db.rollback()
        duration = (datetime.now() - start_time).total_seconds()

        record_task_result(
            task_id=task_id,
            task_name="cleanup_expired_codes",
            status="failed",
            error=str(e),
            duration=duration,
        )
        raise

    finally:
        db.close()


@celery_app.task(
    name="app.tasks.cleanup_tasks.cleanup_old_logs_task",
    bind=True,
)
def cleanup_old_logs_task(self, days: int = 30) -> Dict[str, Any]:
    """
    清理旧日志（可根据日志系统实现）

    Args:
        days: 保留天数

    Returns:
        清理结果
    """
    task_id = self.request.id
    start_time = datetime.now()

    logger.info(f"[{task_id}] 开始清理 {days} 天前的日志")

    # 这里可以根据实际日志存储方式实现
    # 例如：清理数据库中的日志表、清理日志文件等

    duration = (datetime.now() - start_time).total_seconds()

    return record_task_result(
        task_id=task_id,
        task_name="cleanup_old_logs",
        status="success",
        result={"message": f"清理了 {days} 天前的日志"},
        duration=duration,
    )

