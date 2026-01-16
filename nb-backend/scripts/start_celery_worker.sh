#!/bin/bash
# Celery Worker 启动脚本
# 用于处理异步任务

# 设置环境变量（如果需要）
# export CELERY_BROKER_URL="redis://localhost:6379/0"

# 进入项目目录
cd "$(dirname "$0")/.."

# 获取项目根目录
PROJECT_ROOT="$(pwd)"

# 日志和 PID 文件目录
LOG_DIR="${PROJECT_ROOT}/logs"
mkdir -p "${LOG_DIR}"

# 从环境变量读取并发数，默认为 CPU 核心数
# 兼容 Linux (nproc) 和 macOS (sysctl)
get_cpu_count() {
    if command -v nproc >/dev/null 2>&1; then
        nproc
    else
        sysctl -n hw.ncpu 2>/dev/null || echo 4
    fi
}
CONCURRENCY="${CELERY_CONCURRENCY:-$(get_cpu_count)}"

# 启动 Celery Worker
# -A: 指定 celery 应用模块
# worker: 启动 worker 模式
# --loglevel=info: 日志级别
# --concurrency: 并发进程数（从环境变量读取）
# --queues: 指定要处理的队列
# --max-tasks-per-child: 每个 worker 处理任务数后重启（防止内存泄漏）

celery -A app.celery_app worker \
    --loglevel=info \
    --concurrency="${CONCURRENCY}" \
    --queues=default,email,cleanup,api,stats,low \
    --max-tasks-per-child=1000 \
    --pidfile="${LOG_DIR}/celery-worker.pid" \
    --logfile="${LOG_DIR}/celery-worker.log"
