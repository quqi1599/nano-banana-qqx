#!/bin/bash

# 自动生成 .env 文件的脚本
# 用法: ./generate-env.sh

set -e

ENV_FILE=".env"

# 生成随机密码函数
generate_password() {
    openssl rand -base64 32 | tr -d "=+/" | cut -c1-25
}

echo "🔐 正在生成 .env 文件..."

# 生成随机密码
POSTGRES_PASSWORD=$(generate_password)
JWT_SECRET=$(generate_password)
ADMIN_PASSWORD=$(generate_password)

# 创建 .env 文件
cat > "$ENV_FILE" << EOF
# ==================== 数据库配置 ====================
POSTGRES_USER=postgres
POSTGRES_PASSWORD=$POSTGRES_PASSWORD

# ==================== Redis 配置 ====================
REDIS_URL=redis://redis:6379/0

# ==================== 应用配置 ====================
ENVIRONMENT=production
JWT_SECRET_KEY=$JWT_SECRET

# ==================== CORS 配置 ====================
# 允许的前端域名，多个用逗号分隔
# 示例: https://example.com,https://www.example.com
CORS_ORIGINS_LIST=

# ==================== API 端点配置 ====================
# NewAPI 中转接口地址
NEWAPI_BASE_URL=https://nanobanana2.peacedejiai.cc

# ==================== 管理员配置 ====================
# 管理员邮箱（多个用逗号分隔，第一个为主管理员）
ADMIN_EMAIL=admin@example.com
# 管理员密码
ADMIN_PASSWORD=$ADMIN_PASSWORD
# 管理员初始积分
ADMIN_SEED_CREDIT_BALANCE=10000

# ==================== 邮件服务配置（阿里云邮件推送）====================
# SMTP 服务器地址
ALIYUN_SMTP_HOST=smtpdm.aliyun.com
# SMTP 端口（465 for SSL）
ALIYUN_SMTP_PORT=465
# SMTP 用户名（由阿里云提供）
ALIYUN_SMTP_USER=
# SMTP 密码（由阿里云提供）
ALIYUN_SMTP_PASSWORD=
# 发件人名称
ALIYUN_EMAIL_FROM_NAME=DEAI
# 回复邮箱
ALIYUN_EMAIL_REPLY_TO=

# ==================== 邮件验证码配置 ====================
# 验证码有效期（分钟）
EMAIL_CODE_EXPIRE_MINUTES=10

# ==================== 模型计费配置 ====================
# Gemini 3 Pro 每次请求消耗积分
CREDITS_GEMINI_3_PRO=10
# Gemini 2.5 Flash 每次请求消耗积分
CREDITS_GEMINI_25_FLASH=5
EOF

chmod 600 "$ENV_FILE"

echo "✅ .env 文件已生成！"
echo ""
echo "📋 重要信息（请妥善保存）："
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "数据库密码: $POSTGRES_PASSWORD"
echo "JWT 密钥: $JWT_SECRET"
echo "管理员密码: $ADMIN_PASSWORD"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "⚠️  请务必修改以下配置："
echo "1. ADMIN_EMAIL - 改为你的真实邮箱"
echo "2. 如需邮件功能，配置 ALIYUN_SMTP_USER 和 ALIYUN_SMTP_PASSWORD"
echo ""
echo "💡 编辑 .env 文件: nano .env"
