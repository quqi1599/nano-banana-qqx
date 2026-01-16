#!/bin/bash
# Flower 监控面板启动脚本
# 提供类似 Laravel Horizon 的 Web 监控界面

# 设置环境变量（如果需要）
# export CELERY_BROKER_URL="redis://localhost:6379/0"
# export FLOWER_PORT=5555

# 进入项目目录
cd "$(dirname "$0")/.."

# 校验必须的环境变量
if [ -z "$FLOWER_PASSWORD" ]; then
    echo "FLOWER_PASSWORD 未设置，请先通过环境变量提供"
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
    --pidfile=/tmp/flower.pid \
    --logfile=/tmp/flower.log
