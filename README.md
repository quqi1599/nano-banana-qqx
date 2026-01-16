# NanoBanana Pro

AI 图片生成平台，基于 Gemini 3 Pro 模型，支持积分计费、用户管理、Token 池等企业级功能。

## 🚀 快速部署

### 初次部署

```bash
# 克隆项目
git clone https://github.com/quqi1599/nano-banana-qqx.git
cd nano-banana-qqx

# 创建 .env
cp .env.production.example .env

# 编辑 .env，填写必需配置
nano .env

# 启动所有服务
docker-compose up -d

# 访问
# 前端: http://localhost
# 后端 API: http://localhost:8000
# API 文档: http://localhost:8000/docs
```

**必填环境变量（.env）：**
```bash
POSTGRES_PASSWORD=你的数据库密码（至少16位）
REDIS_URL=redis://:你的Redis密码@redis:6379/0
JWT_SECRET_KEY=你的JWT密钥（至少32位）
TOKEN_ENCRYPTION_KEY=你的加密密钥（至少32位）
ADMIN_PASSWORD=管理员密码（至少12位）
```

### VPS 更新部署

```bash
# 进入项目目录
cd ~/nano-banana-qqx

# 拉取最新代码
git pull

# 重新构建并启动
docker-compose down
docker-compose up -d --build

# 查看日志
docker-compose logs -f
```

## ⚠️ 常见问题

### 数据库密码错误

如果看到 `password authentication failed for user "postgres"`：

```bash
cd ~/nano-banana-qqx
docker-compose down -v  # ⚠️ 会删除所有数据
docker-compose up -d
```

> [!WARNING]
> 使用 `-v` 会删除所有数据库数据（用户、积分、历史记录等），管理员账号会重置为默认。

### Redis 连接失败

如果后端日志包含 `NOAUTH Authentication required` 或 `Redis connection failed`：

1) 检查 `.env` 中是否设置了 `REDIS_URL`
2) 确保格式为：`redis://:你的密码@redis:6379/0`
3) 重新启动服务：`docker-compose up -d`

> 注意：不要在 `.env` 中写行内注释（会被当作值的一部分）。

## 🏗️ 项目架构

```
nbnb-pro/
├── nb-app/              # React 前端 (Vite + TypeScript + Tailwind)
├── nb-backend/          # Python 后端 (FastAPI + PostgreSQL + Redis)
└── docker-compose.yml   # 整合部署配置
```

## ✨ 核心功能

### 前端
- 🎨 现代化 AI 图片生成界面
- 🔄 Pipeline 编排工作流 (串行/并行/组合)
- 🖼️ 图片历史记录管理
- 🎮 等待街机模式 (贪吃蛇/恐龙跑酷/2048/生命游戏)
- 📱 响应式设计，支持移动端

### 后端
- 👤 **用户系统**：注册、登录、JWT 认证
- 💰 **积分计费**：按次扣费，余额管理
- 🎫 **兑换码系统**：批量生成、用户兑换
- 🔑 **Token 池管理**：多 Token 轮询、负载均衡
- 📊 **统计看板**：用户活跃、模型使用、日志统计
- 👨‍💼 **管理后台**：用户管理、Token 管理、数据看板

## 💰 积分计费规则

| 模型 | 每次消耗积分 |
|------|-------------|
| gemini-3-pro-image-preview | 10 积分 |
| gemini-2.5-flash-image | 1 积分 |

- 下单支付后生成兑换码，兑换后积分到账
- 兑换码由管理员后台生成

## � 技术栈

### 前端
- React 19 + Vite 7
- TypeScript + Tailwind CSS 4
- Zustand 状态管理
- Google GenAI SDK

### 后端
- FastAPI + Uvicorn
- PostgreSQL 16 + SQLAlchemy 2
- Redis 7
- JWT 认证 (python-jose)

## 📖 API 文档

启动后端后访问: http://localhost:8000/docs

## 📄 License

AGPL-3.0
