#!/bin/bash
# ========================================
# 一键重置部署脚本
# ========================================
# 用途：清空数据库、重新构建、重新部署
# 使用方法：chmod +x reset-deploy.sh && ./reset-deploy.sh
# ========================================

set -e  # 遇到错误立即退出

echo "================================"
echo "  NB Nano Banana - 重置部署"
echo "================================"
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. 确认操作
echo -e "${YELLOW}警告：此操作将：${NC}"
echo "  - 停止并删除所有容器"
echo "  - 清空数据库数据"
echo "  - 清空 Redis 缓存"
echo "  - 重新构建并启动服务"
echo ""
read -p $(echo -e "${RED}确认继续？(输入 YES 继续): ${NC}") confirm

if [ "$confirm" != "YES" ]; then
    echo -e "${YELLOW}操作已取消${NC}"
    exit 0
fi

echo ""
echo "================================"
echo "步骤 1/5: 停止并清理容器..."
echo "================================"
docker-compose down -v

echo ""
echo "================================"
echo "步骤 2/5: 删除 Docker volumes..."
echo "================================"
docker volume rm nano-banana-qqx_postgres_data 2>/dev/null || echo "postgres_data 不存在或已删除"
docker volume rm nano-banana-qqx_redis_data 2>/dev/null || echo "redis_data 不存在或已删除"

echo ""
echo "================================"
echo "步骤 3/5: 清理旧镜像（可选）..."
echo "================================"
read -p "是否重新构建镜像？(y/N): " rebuild
if [ "$rebuild" = "y" ] || [ "$rebuild" = "Y" ]; then
    echo "重新构建中..."
    docker-compose build --no-cache
fi

echo ""
echo "================================"
echo "步骤 4/5: 启动服务..."
echo "================================"
docker-compose up -d

echo ""
echo "================================"
echo "步骤 5/5: 等待服务就绪..."
echo "================================"
sleep 10

# 检查服务状态
echo ""
echo "================================"
echo "服务状态检查"
echo "================================"
docker-compose ps

echo ""
echo "================================"
echo "查看后端日志"
echo "================================"
docker logs --tail 30 nbnb-backend

echo ""
echo -e "${GREEN}================================"
echo "  重置部署完成！"
echo "================================${NC}"
echo ""
echo "常用命令："
echo "  查看所有容器: docker-compose ps"
echo "  查看后端日志: docker logs -f nbnb-backend"
echo "  查看前端日志: docker logs -f nbnb-frontend"
echo "  停止服务:     docker-compose down"
echo "  重启服务:     docker-compose restart"
echo ""
