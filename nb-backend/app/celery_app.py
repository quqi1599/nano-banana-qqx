"""
Celery 应用配置

支持多个队列：
- default: 默认队列
- email: 邮件发送队列
- cleanup: 数据清理队列
- api: API 代理队列
- low: 低优先级队列
"""
import os
from celery import Celery
from celery.schedules import crontab

from app.config import get_settings

settings = get_settings()

# Redis 配置
redis_url = getattr(settings, 'celery_broker', settings.redis_url)

celery_app = Celery(
    "nbnb",
    broker=redis_url,
    backend=redis_url,
    include=[
        "app.tasks.email_tasks",
        "app.tasks.cleanup_tasks",
        "app.tasks.api_tasks",
        "app.tasks.stats_tasks",
    ]
)

# Celery 配置
celery_app.conf.update(
    # 任务结果过期时间（1天）
    result_expires=86400,
    # 任务结果序列化格式
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    # 时区
    timezone="Asia/Shanghai",
    enable_utc=True,
    # 任务超时设置（防止长时间运行的任务阻塞 worker）
    task_time_limit=3600,           # 硬超时：1小时后强制终止任务
    task_soft_time_limit=3000,      # 软超时：50秒后发送 SoftTimeLimitExceeded 异常
    task_acks_late=True,            # 任务执行完成后才确认
    worker_prefetch_multiplier=1,   # 每次只预取一个任务
    # 任务路由
    task_routes={
        "app.tasks.email_tasks.*": {"queue": "email"},
        "app.tasks.cleanup_tasks.*": {"queue": "cleanup"},
        "app.tasks.api_tasks.*": {"queue": "api"},
        "app.tasks.stats_tasks.*": {"queue": "stats"},
        "app.tasks.low_priority_tasks.*": {"queue": "low"},
    },
    # 任务限流
    task_annotations={
        "app.tasks.email_tasks.send_email_task": {"rate_limit": "10/m"},
        "app.tasks.api_tasks.proxy_api_task": {"rate_limit": "30/m"},
    },
    # 失败任务处理
    task_reject_on_worker_lost=True,
    # 定时任务
    beat_schedule={
        # 每天凌晨 2 点清理对话历史
        "cleanup-conversations-daily": {
            "task": "app.tasks.cleanup_tasks.cleanup_old_conversations_task",
            "schedule": crontab(hour=2, minute=0),
        },
        # 每小时统计一次使用情况
        "collect-hourly-stats": {
            "task": "app.tasks.stats_tasks.collect_hourly_stats_task",
            "schedule": crontab(minute=0),
        },
    },
)

# Worker 配置
celery_app.conf.worker_max_tasks_per_child = 1000
celery_app.conf.worker_concurrency = os.cpu_count() or 4

if __name__ == "__main__":
    celery_app.start()
