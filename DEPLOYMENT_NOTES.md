# 部署注意事项

## 数据库迁移问题（已修复）

### 问题描述
在 2026-01-16 的部署中，后端容器启动时卡在数据库迁移步骤，日志停留在：
```
INFO  [alembic.runtime.migration] Context impl PostgresqlImpl.
INFO  [alembic.runtime.migration] Will assume transactional DDL.
```

### 根本原因
`app/database.py` 中的 `init_db()` 函数同时调用了：
1. `Base.metadata.create_all()` - SQLAlchemy 的表创建
2. `alembic upgrade head` - Alembic 的数据库迁移

这两者**不应该混用**：
- `create_all()` 会直接创建所有表（包括 `smtp_config`）
- 然后 Alembic 再次尝试处理同一个迁移时，虽然防御性代码能跳过建表，但在修改列属性（如 `user_id` nullable）时会因为状态不一致而卡住

### 解决方案
**已在代码中修复**：移除了 `Base.metadata.create_all()` 调用，生产环境只使用 Alembic migrations。

如果需要从零初始化数据库，请使用：
```bash
# 在容器内或本地环境
alembic upgrade head
```

### 临时应急方案（如果再次遇到卡住）
1. 手动标记迁移为已完成：
   ```bash
   docker exec -it nbnb-postgres psql -U postgres -d nbnb
   INSERT INTO alembic_version (version_num) VALUES ('迁移版本号') ON CONFLICT DO NOTHING;
   \q
   ```

2. 临时注释掉 `run_migrations()` 调用（**不推荐，仅用于紧急情况**）：
   ```bash
   docker exec -it nbnb-backend sed -i '73s/^/# /' /app/app/database.py
   docker-compose restart backend
   ```

### 正确的部署流程
```bash
# 1. 拉取最新代码
git pull

# 2. 重新构建镜像（使用新的 database.py）
docker-compose build --no-cache backend

# 3. 启动服务
docker-compose up -d

# 4. 查看日志确认启动成功
docker-compose logs -f backend
```

应该看到：
```
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000
```

---

## 前端静态资源缓存问题

### 问题
更新了 `public/wechat-group.jpg` 后，浏览器仍显示旧图片。

### 原因
1. Docker 构建缓存
2. 浏览器缓存

### 解决方案
1. **强制重新构建前端镜像**：
   ```bash
   docker-compose build --no-cache frontend
   docker-compose up -d frontend
   ```

2. **为静态资源添加版本号**（已在代码中实现）：
   ```tsx
   <img src="/wechat-group.jpg?v=2" />
   ```

3. **清除浏览器缓存** 或使用隐私模式测试

---

## 联系方式
- 技术支持微信群：见应用内二维码
- 项目仓库：https://github.com/quqi1599/nano-banana-qqx
