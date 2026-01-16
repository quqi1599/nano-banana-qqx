"""
Celery 任务模块

提供异步任务处理能力：
- email_tasks: 邮件发送任务
- cleanup_tasks: 数据清理任务
- api_tasks: API 代理任务
- stats_tasks: 统计任务
"""
from app.celery_app import celery_app

__all__ = ["celery_app"]
