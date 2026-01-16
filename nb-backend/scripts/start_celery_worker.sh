#!/bin/bash
# Celery Worker 启动脚本
# 用于处理异步任务

# 设置环境变量（如果需要）
# export CELERY_BROKER_URL="redis://localhost:6379/0"

# 进入项目目录
cd "$(dirname "$0")/.."

# 启动 Celery Worker
# -A: 指定 celery 应用模块
# worker: 启动 worker 模式
# --loglevel=info: 日志级别
# --concurrency=4: 并发进程数（默认是 CPU 核心数）
# --queues: 指定要处理的队列（可以启动多个 worker 处理不同队列）
# --max-tasks-per-child=1000: 每个 worker 处理 1000 个任务后重启（防止内存泄漏）

celery -A app.celery_app worker \
    --loglevel=info \
    --concurrency=4 \
    --queues=default,email,cleanup,api,stats,low \
    --max-tasks-per-child=1000 \
    --pidfile=/tmp/celery-worker.pid \
    --logfile=/tmp/celery-worker.log
