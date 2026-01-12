#!/bin/bash
# NanoBanana 生产环境部署脚本
# 使用方法: ./deploy.sh [环境]
# 环境选项: dev (开发), prod (生产)

set -e  # 遇到错误立即退出

ENV=${1:-prod}
PROJECT_NAME="nbnb"

echo "=========================================="
echo "  NanoBanana 部署脚本 - 环境: $ENV"
echo "=========================================="

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查必要命令
check_command() {
    if ! command -v $1 &> /dev/null; then
        echo -e "${RED}错误: $1 未安装，请先安装${NC}"
        exit 1
    fi
}

echo "检查系统依赖..."
check_command docker
check_command docker-compose

# 停止并删除旧容器
echo "停止旧容器..."
docker-compose down 2>/dev/null || true

# 清理旧镜像（可选，用于强制重新构建）
if [ "$ENV" = "prod" ]; then
    echo "生产环境：清理旧镜像..."
    docker-compose build --no-cache --pull
else
    echo "开发环境：构建镜像..."
    docker-compose build
fi

# 启动服务
echo "启动服务..."
docker-compose up -d

# 等待服务启动
echo "等待服务启动..."
sleep 10

# 检查服务状态
echo "检查服务状态..."
docker-compose ps

# 检查数据库连接
echo "检查数据库连接..."
until docker exec nbnb-postgres pg_isready -U postgres &> /dev/null; do
    echo "等待 PostgreSQL 启动..."
    sleep 2
done
echo -e "${GREEN}PostgreSQL 已就绪${NC}"

# 检查 Redis 连接
echo "检查 Redis 连接..."
until docker exec nbnb-redis redis-cli ping &> /dev/null; do
    echo "等待 Redis 启动..."
    sleep 2
done
echo -e "${GREEN}Redis 已就绪${NC}"

# 检查后端健康状态
echo "检查后端服务..."
MAX_ATTEMPTS=30
ATTEMPT=0
until [ $ATTEMPT -ge $MAX_ATTEMPTS ]; do
    if curl -sf http://localhost:8000/api/health &> /dev/null; then
        echo -e "${GREEN}后端服务已就绪${NC}"
        break
    fi
    ATTEMPT=$((ATTEMPT+1))
    echo "等待后端服务启动... ($ATTEMPT/$MAX_ATTEMPTS)"
    sleep 2
done

if [ $ATTEMPT -ge $MAX_ATTEMPTS ]; then
    echo -e "${RED}后端服务启动失败${NC}"
    docker-compose logs backend
    exit 1
fi

# 显示日志
echo ""
echo "=========================================="
echo -e "${GREEN}部署完成！${NC}"
echo "=========================================="
echo ""
echo "服务访问地址:"
echo "  前端: http://localhost"
echo "  后端: http://localhost:8000"
echo "  API文档: http://localhost:8000/docs"
echo ""
echo "查看日志命令:"
echo "  所有服务: docker-compose logs -f"
echo "  后端: docker-compose logs -f backend"
echo "  前端: docker-compose logs -f frontend"
echo ""
echo "其他常用命令:"
echo "  停止服务: docker-compose down"
echo "  重启服务: docker-compose restart"
echo "  进入后端: docker exec -it nbnb-backend bash"
echo "  进入数据库: docker exec -it nbnb-postgres psql -U postgres -d nbnb"
echo ""
