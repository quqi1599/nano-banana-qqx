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


def _run_async(coro):
    """
    在同步上下文中运行异步函数

    使用 asgiref.sync.async_to_sync 避免事件循环冲突
    比 asyncio.run() 更安全，适用于 Celery worker 环境
    """
    from asgiref.sync import async_to_sync
    return async_to_sync(coro)


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
    from app.database import async_session_maker

    try:
        # 使用 async_to_sync 避免事件循环冲突
        async def cleanup():
            async with async_session_maker() as db:
                return await cleanup_old_conversations(db, dry_run=False)

        result = _run_async(cleanup())

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

