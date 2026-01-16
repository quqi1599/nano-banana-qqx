# 部署指南

## 快速开始

### 1. 首次部署

```bash
# 克隆项目
git clone <your-repo-url>
cd nano-banana-qqx

# 创建 .env 文件
cp .env.production.example .env

# 编辑 .env，填写必需配置
nano .env
```

**必须配置的环境变量：**
```bash
POSTGRES_PASSWORD=你的数据库密码（至少16位）
REDIS_URL=redis://:你的Redis密码@redis:6379/0
JWT_SECRET_KEY=你的JWT密钥（至少32位）
TOKEN_ENCRYPTION_KEY=你的加密密钥（至少32位）
ADMIN_PASSWORD=管理员密码（至少12位）
```

**生成密钥的命令：**
```bash
# 生成 Fernet 密钥（用于 JWT 和 TOKEN 加密）
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

# 或使用 openssl
openssl rand -base64 32
```

### 2. 检查环境

```bash
chmod +x check-env.sh
./check-env.sh
```

### 3. 启动服务

```bash
docker-compose up -d
```

### 4. 查看日志

```bash
# 查看后端日志
docker logs -f nbnb-backend

# 查看所有服务日志
docker-compose logs -f
```

## 常用命令

| 操作 | 命令 |
|------|------|
| 查看服务状态 | `docker-compose ps` |
| 查看后端日志 | `docker logs -f nbnb-backend` |
| 查看前端日志 | `docker logs -f nbnb-frontend` |
| 停止服务 | `docker-compose down` |
| 重启服务 | `docker-compose restart` |
| 重启单个服务 | `docker-compose restart backend` |
| 进入后端容器 | `docker exec -it nbnb-backend bash` |
| 进入数据库 | `docker exec -it nbnb-postgres psql -U postgres -d nbnb` |

## 重置部署

当需要清空数据库重新部署时：

```bash
chmod +x reset-deploy.sh
./reset-deploy.sh
```

该脚本会：
- 停止并删除所有容器
- 清空数据库和 Redis 数据
- 重新启动服务
- 自动创建管理员账号

## 故障排查

### 问题：后端启动失败，密码认证错误

**原因：** `.env` 文件中的 `POSTGRES_PASSWORD` 未设置

**解决：**
```bash
# 检查 .env 文件
cat .env | grep POSTGRES_PASSWORD

# 如果为空，设置密码
echo "POSTGRES_PASSWORD=your_secure_password" >> .env

# 重启
docker-compose down
docker-compose up -d
```

### 问题：端口被占用

**解决：**
```bash
# 查看端口占用
sudo lsof -i :80
sudo lsof -i :5432

# 停止占用端口的服务
sudo systemctl stop nginx  # 如果是 nginx 占用 80 端口
```

### 问题：数据库连接失败

```bash
# 检查数据库容器状态
docker ps | grep postgres

# 进入数据库容器
docker exec -it nbnb-postgres psql -U postgres -d nbnb

# 重置数据库
docker-compose down -v
docker-compose up -d
```

## 生产环境检查清单

- [ ] 修改了所有默认密码
- [ ] 设置了强密码（至少16位）
- [ ] 配置了 HTTPS
- [ ] 配置了防火墙
- [ ] 配置了邮件服务（用于验证码）
- [ ] 设置了管理员通知邮箱
- [ ] 启用了 Sentry 错误监控（可选）
