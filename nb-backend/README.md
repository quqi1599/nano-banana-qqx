# NanoBanana Backend

Python FastAPI 后端服务，提供用户认证、积分管理、兑换码、Token 池等功能。

## 技术栈

- **框架**: FastAPI
- **数据库**: PostgreSQL + SQLAlchemy
- **缓存**: Redis
- **认证**: JWT
- **部署**: Docker

## 快速开始

### 开发环境

```bash
# 创建虚拟环境
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt

# 启动 PostgreSQL 和 Redis
docker-compose up -d postgres redis

# 运行数据库迁移
alembic upgrade head

# 启动开发服务器
uvicorn app.main:app --reload --port 8000
```

### Docker 部署

```bash
docker-compose up -d
```

## API 文档

启动后访问: http://localhost:8000/docs

## 环境变量

复制 `.env.example` 为 `.env` 并填写配置：

```bash
cp .env.example .env
```
