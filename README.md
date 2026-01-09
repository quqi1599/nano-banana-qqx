# NanoBanana Pro

AI 图片生成平台，基于 Gemini 3 Pro 模型，支持积分计费、用户管理、Token 池等企业级功能。

## 🏗️ 项目架构

```
nbnb-pro/
├── nb-app/              # React 前端 (Vite + TypeScript + Tailwind)
├── nb-backend/          # Python 后端 (FastAPI + PostgreSQL + Redis)
└── docker-compose.yml   # 整合部署配置
```

## ✨ 核心功能

### 前端 (nb-app)
- 🎨 现代化 AI 图片生成界面
- 🔄 Pipeline 编排工作流 (串行/并行/组合)
- 🖼️ 图片历史记录管理
- 🎮 等待街机模式 (贪吃蛇/恐龙跑酷/2048/生命游戏)
- 📱 响应式设计，支持移动端

### 后端 (nb-backend)
- 👤 **用户系统**：注册、登录、JWT 认证
- 💰 **积分计费**：按次扣费，余额管理
- 🎫 **兑换码系统**：批量生成、用户兑换
- 🔑 **Token 池管理**：多 Token 轮询、负载均衡
- 📊 **统计看板**：用户活跃、模型使用、日志统计
- 👨‍💼 **管理后台**：用户管理、Token 管理、数据看板

## 🚀 快速开始

### 方式一：Docker Compose (推荐)

```bash
# 克隆项目
git clone https://github.com/your-repo/nbnb-pro.git
cd nbnb-pro

# 配置环境变量
cp nb-backend/.env.example nb-backend/.env
# 编辑 .env 文件，设置 JWT_SECRET_KEY 等

# 启动所有服务
docker-compose up -d

# 访问
# 前端: http://localhost
# 后端 API: http://localhost:8000
# API 文档: http://localhost:8000/docs
```

### 方式二：开发模式

**前端：**
```bash
cd nb-app
bun install
bun dev
# 访问 http://localhost:3000
```

**后端：**
```bash
cd nb-backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 启动数据库
docker-compose up -d postgres redis

# 启动后端
uvicorn app.main:app --reload --port 8000
```

## 📖 API 文档

启动后端后访问: http://localhost:8000/docs

### 核心 API

| 分类 | 端点 | 说明 |
|------|------|------|
| 认证 | `POST /api/auth/register` | 用户注册 |
| 认证 | `POST /api/auth/login` | 用户登录 |
| 积分 | `GET /api/credits/balance` | 查询余额 |
| 积分 | `POST /api/redeem/use` | 兑换码兑换 |
| 代理 | `POST /api/proxy/generate` | AI 图片生成 |
| 管理 | `GET /api/stats/dashboard` | 统计看板 |

## 🔧 技术栈

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

## 📦 部署

### VPS 部署

```bash
# 拉取最新代码
cd ~/nbnb-pro && git pull

# 重新构建并启动
docker-compose down
docker-compose up -d --build

# 查看日志
docker-compose logs -f
```

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DATABASE_URL` | PostgreSQL 连接 | `postgresql://postgres:postgres@localhost:5432/nbnb` |
| `REDIS_URL` | Redis 连接 | `redis://localhost:6379/0` |
| `JWT_SECRET_KEY` | JWT 密钥 | ⚠️ 必须修改 |
| `NEWAPI_BASE_URL` | NewAPI 地址 | `https://nanobanana2.peacedejiai.cc` |
| `CREDITS_GEMINI_3_PRO` | Gemini 3 Pro 每次消耗 | `10` |
| `CREDITS_GEMINI_25_FLASH` | Flash 每次消耗 | `5` |

## 💰 积分计费规则

| 模型 | 每次消耗积分 |
|------|-------------|
| gemini-3-pro-image-preview | 10 积分 |
| gemini-2.5-flash-image | 5 积分 |

- 新用户注册赠送 50 积分
- 兑换码由管理员后台生成

## 📄 License

AGPL-3.0
