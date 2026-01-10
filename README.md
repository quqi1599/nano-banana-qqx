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

## 🔍 故障排查

### 数据库迁移问题

**问题描述：** 在使用 `docker-compose down -v` 重建数据库后，运行 `alembic upgrade head` 时报错：

```
asyncpg.exceptions.DuplicateColumnError: column "pro3_credits" already exists
```

**原因分析：**
- 后端的 `init_db()` 函数会在启动时自动创建表结构（包括所有字段）
- Alembic 迁移脚本尝试在已存在字段的基础上再次添加同名字段
- 这是因为初始化代码和迁移脚本都定义了相同的字段

**解决方法：**

```bash
cd ~/nano-banana-qqx

# 1. 先启动服务让后端自动创建表结构
sudo docker-compose up -d

# 2. 等待后端完成初始化（15秒）
sleep 15

# 3. 标记迁移为已完成（不实际执行）
sudo docker-compose exec backend alembic stamp head

# 4. 重启后端
sudo docker-compose restart backend

# 5. 验证服务状态
sudo docker logs nbnb-backend --tail 20
```

**预期输出：**
```
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000
✅ Admin user created: admin@example.com
```

### 常见部署问题

**1. 容器无法启动 (`ContainerConfig` 错误)**

这是 docker-compose 版本兼容性问题：

```bash
# 手动删除旧容器
sudo docker rm -f nbnb-backend nbnb-frontend

# 重新启动
sudo docker-compose up -d
```

**2. 数据库密码验证失败**

如果看到 `password authentication failed for user "postgres"`：

```bash
# 完全重建（会删除所有数据）
sudo docker-compose down -v
sudo docker-compose up -d
```

**3. API 返回 404**

检查后端路由是否正确注册，确保 `main.py` 中包含了所有 router：

```bash
# 查看后端日志
sudo docker logs nbnb-backend --tail 50
```

## 📄 License

AGPL-3.0
