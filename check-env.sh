#!/bin/bash
# ========================================
# 环境检查脚本
# ========================================
# 用途：检查部署环境是否正常
# 使用方法：./check-env.sh
# ========================================

echo "================================"
echo "  NB Nano Banana - 环境检查"
echo "================================"
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

check_pass=true

# 1. 检查 .env 文件
echo "1. 检查 .env 文件..."
if [ -f .env ]; then
    echo -e "  ${GREEN}✓ .env 文件存在${NC}"

    # 检查必需的环境变量
    required_vars=("POSTGRES_PASSWORD" "REDIS_URL" "JWT_SECRET_KEY" "TOKEN_ENCRYPTION_KEY" "ADMIN_PASSWORD")
    for var in "${required_vars[@]}"; do
        if grep -q "^${var}=" .env && ! grep -q "^${var}=$" .env; then
            echo -e "  ${GREEN}✓${NC} $var 已设置"
            if [ "$var" = "REDIS_URL" ]; then
                redis_url_value=$(grep -E "^REDIS_URL=" .env | head -1 | cut -d= -f2-)
                if [[ "$redis_url_value" != redis://* ]]; then
                    echo -e "  ${YELLOW}⚠${NC} REDIS_URL 格式可能不正确（应为 redis://...）"
                elif [[ "$redis_url_value" != redis://:*@* ]]; then
                    echo -e "  ${YELLOW}⚠${NC} REDIS_URL 可能缺少密码（建议使用 redis://:password@host:port/db）"
                fi
            fi
        else
            echo -e "  ${RED}✗${NC} $var 未设置或为空"
            check_pass=false
        fi
    done
else
    echo -e "  ${RED}✗ .env 文件不存在${NC}"
    echo -e "  ${YELLOW}请先创建 .env 文件：${NC}"
    echo "     cp .env.production.example .env"
    echo "     然后编辑 .env 填写必需的配置"
    check_pass=false
fi

echo ""

# 2. 检查 Docker
echo "2. 检查 Docker..."
if command -v docker &> /dev/null; then
    echo -e "  ${GREEN}✓ Docker 已安装${NC}"
    docker --version | head -1
else
    echo -e "  ${RED}✗ Docker 未安装${NC}"
    check_pass=false
fi

echo ""

# 3. 检查 Docker Compose
echo "3. 检查 Docker Compose..."
if command -v docker-compose &> /dev/null || docker compose version &> /dev/null; then
    echo -e "  ${GREEN}✓ Docker Compose 已安装${NC}"
    docker-compose --version 2>/dev/null || docker compose version
else
    echo -e "  ${RED}✗ Docker Compose 未安装${NC}"
    check_pass=false
fi

echo ""

# 4. 检查端口占用
echo "4. 检查端口占用..."
ports=(80 5432 6379 8000)
for port in "${ports[@]}"; do
    if lsof -i :$port &> /dev/null; then
        echo -e "  ${YELLOW}⚠${NC} 端口 $port 已被占用"
    else
        echo -e "  ${GREEN}✓${NC} 端口 $port 可用"
    fi
done

echo ""

# 5. 检查现有容器
echo "5. 检查现有容器..."
if docker ps -a --format "table {{.Names}}\t{{.Status}}" | grep -q "nbnb-"; then
    echo "  现有容器："
    docker ps -a --format "table {{.Names}}\t{{.Status}}" | grep "nbnb-"
else
    echo -e "  ${YELLOW}⚠ 没有找到 nbnb 相关容器${NC}"
fi

echo ""
echo "================================"

if [ "$check_pass" = true ]; then
    echo -e "${GREEN}环境检查通过！可以开始部署${NC}"
    echo ""
    echo "运行以下命令部署："
    echo "  docker-compose up -d"
else
    echo -e "${RED}环境检查失败！请先解决上述问题${NC}"
    exit 1
fi
