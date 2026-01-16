#!/bin/bash
# Celery Beat 启动脚本
# 用于处理定时任务（如每天清理数据、每小时统计等）

# 设置环境变量（如果需要）
# export CELERY_BROKER_URL="redis://localhost:6379/0"

# 进入项目目录
cd "$(dirname "$0")/.."

# 启动 Celery Beat（定时任务调度器）
celery -A app.celery_app beat \
    --loglevel=info \
    --pidfile=/tmp/celery-beat.pid \
    --logfile=/tmp/celery-beat.log \
    --scheduler=redisbeat.RedisScheduler  # 使用 Redis 作为调度器后端（需安装 celery-redbeat）
