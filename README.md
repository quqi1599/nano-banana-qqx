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

## 🔌 访问模式隔离

前端引擎默认走 `Gemini` 或其他 AI API（可配置 `customEndpoint`），目的是让画图请求跟平台的 Token 池、积分、管理后台彻底隔离。  
当前逻辑设计：
- 未登录或未绑定平台账号：访问会默认弹出 API Key 填写框，允许用户输入自己的 Key/endpoint；发起生成请求时直接与配置的 API 通信，前端通过 `syncCurrentMessage` 等机制实时异步同步对话内容到平台后端，确保管理员可以通过 `/api/conversations` 查到全部纪录。
- 已登录平台账号：前端自动关闭 API Key 弹窗并隐藏钥匙按钮，所有生成请求都走我们统一的后台服务（`proxy`、`Gemini` 服务），积分与管理后台直接打通，不能跳回自定义 API。

历史对接说明：
- `useAppStore` 通过 `syncCurrentMessage` + `processSyncQueue` 将每条对话同步到后端，即便使用访客 `visitorId` 也会创建对应记录。
- `get_current_user_optional` 支持 `X-API-Key`，并为 API Key 用户打上 `["api_key"]` 标签。
- `conversations` 路由在判断访问者时会把同一 `visitor_id` 下的记录与 API Key 用户归到同一个账号，确保 Admin 端看到完整历史。
- `SessionManager.tsx` 结合 `sessionStorage` + IndexedDB 持久化游客/未登录用户的对话，自身恢复页面时直接加载本地缓存，让“历史对话”面板对每个浏览器会话都可用。

## 🧭 前端 UI & 引导任务

**✅ 已完成**：前端 UI 与引导已按访问模式隔离实现。

1. **Header 钥匙按钮** (`App.tsx:453-462`)
   - 只在未登录时渲染 (`!isAuthenticated`)
   - 点击打开 API Key 弹窗
   - 登录后立即隐藏该按钮
   - 登录成功时若弹窗仍打开会自动关闭 (`App.tsx:191-195`)

2. **GuideTour 引导** (`guideFlows.ts:146-152`)
   - "设置面板"引导第一个步骤描述访问模式隔离逻辑
   - 说明【未登录模式】和【登录模式】的区别

3. **数据同步保证**
   - `settings` 页面、对话历史持久化到本地缓存
   - Admin 端 `/api/conversations` 支持查询所有 visitor/API Key 产生的记录
   - `conversations` 路由支持 `X-Visitor-Id` 和 `X-API-Key` 认证

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
