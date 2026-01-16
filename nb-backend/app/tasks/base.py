"""
Celery 任务基础工具

提供：
- 数据库会话管理
- 任务结果记录
- 任务状态追踪
"""
import logging
from datetime import datetime
from typing import Dict, Any, Optional
from functools import wraps

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.config import get_settings

_sync_engine = None
_SessionLocal: Optional[sessionmaker] = None


def _get_sync_sessionmaker() -> sessionmaker:
    global _sync_engine, _SessionLocal
    if _SessionLocal is None:
        settings = get_settings()
        _sync_engine = create_engine(
            settings.database_url.replace("postgresql+asyncpg://", "postgresql://"),
            pool_pre_ping=True,
            pool_size=5,
            max_overflow=10,
        )
        _SessionLocal = sessionmaker(bind=_sync_engine)
    return _SessionLocal

logger = logging.getLogger(__name__)


def get_task_db():
    """
    为任务获取同步数据库会话

    注意：Celery 任务运行在单独的进程中，需要独立的数据库会话
    """
    return _get_sync_sessionmaker()()


def record_task_result(
    task_id: str,
    task_name: str,
    status: str,
    result: Optional[Any] = None,
    error: Optional[str] = None,
    duration: float = 0,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    记录任务执行结果

    Args:
        task_id: 任务ID
        task_name: 任务名称
        status: 任务状态 (success/failed/pending)
        result: 任务结果
        error: 错误信息
        duration: 执行时长（秒）
        metadata: 额外元数据

    Returns:
        任务结果字典
    """
    log_data = {
        "task_id": task_id,
        "task_name": task_name,
        "status": status,
        "duration": f"{duration:.2f}s",
        "timestamp": datetime.now().isoformat(),
    }

    if error:
        log_data["error"] = error
        logger.error(f"Task failed: {log_data}")
    else:
        log_data["result"] = result
        logger.info(f"Task completed: {log_data}")

    return log_data


def task_tracker(task_name: str):
    """
    任务追踪装饰器

    自动记录任务执行时间、成功/失败状态

    用法:
        @task_tracker("my_task")
        def my_task_function():
            ...
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            start_time = datetime.now()
            task_id = kwargs.get("task_id", "unknown")

            try:
                result = func(*args, **kwargs)
                duration = (datetime.now() - start_time).total_seconds()

                record_task_result(
                    task_id=task_id,
                    task_name=task_name,
                    status="success",
                    result=result,
                    duration=duration,
                )
                return result

            except Exception as e:
                duration = (datetime.now() - start_time).total_seconds()

                record_task_result(
                    task_id=task_id,
                    task_name=task_name,
                    status="failed",
                    error=str(e),
                    duration=duration,
                )
                raise

        return wrapper
    return decorator


class TaskProgress:
    """
    任务进度追踪器

    用于长任务更新进度
    """

    def __init__(self, task_id: str, total: int):
        self.task_id = task_id
        self.total = total
        self.current = 0
        self.start_time = datetime.now()

    def update(self, current: int, message: str = ""):
        """更新进度"""
        self.current = current
        progress = (current / self.total) * 100 if self.total > 0 else 0
        duration = (datetime.now() - self.start_time).total_seconds()

        logger.info(
            f"Task {self.task_id} progress: {progress:.1f}% "
            f"({current}/{self.total}) - {message}"
        )

        # 这里可以更新到 Redis 或数据库供前端查询
        return {
            "task_id": self.task_id,
            "progress": f"{progress:.1f}%",
            "current": current,
            "total": self.total,
            "message": message,
            "duration": f"{duration:.2f}s",
        }

    def complete(self, message: str = "Completed"):
        """标记完成"""
        return self.update(self.total, message)
