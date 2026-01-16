#!/bin/bash
# Flower 监控面板启动脚本
# 提供类似 Laravel Horizon 的 Web 监控界面

# 设置环境变量（如果需要）
# export CELERY_BROKER_URL="redis://localhost:6379/0"
# export FLOWER_PORT=5555

# 进入项目目录
cd "$(dirname "$0")/.."

# 获取项目根目录
PROJECT_ROOT="$(pwd)"

# 日志和 PID 文件目录
LOG_DIR="${PROJECT_ROOT}/logs"
mkdir -p "${LOG_DIR}"

# 校验必须的环境变量
if [ -z "$FLOWER_PASSWORD" ]; then
    echo "错误: FLOWER_PASSWORD 环境变量未设置"
    echo "用法: FLOWER_PASSWORD=your_password bash $0"
    exit 1
fi

# 启动 Flower
# --broker: Redis 连接地址
# --port: Web 界面端口（默认 5555）
# --basic_auth: 认证信息（用户名:密码）
# --inspect_timeout: Worker 检查超时时间

celery -A app.celery_app flower \
    --broker="${CELERY_BROKER_URL:-redis://localhost:6379/0}" \
    --port="${FLOWER_PORT:-5555}" \
    --basic_auth="${FLOWER_USER:-admin}:${FLOWER_PASSWORD}" \
    --inspect_timeout=10 \
    --pidfile="${LOG_DIR}/flower.pid" \
    --logfile="${LOG_DIR}/flower.log"
