# NanoBanana 生产环境部署指南

## 前置要求

- **服务器系统**: Ubuntu 20.04+ / Debian 11+ / CentOS 8+
- **软件要求**:
  - Docker 20.10+
  - Docker Compose 2.0+

## 快速部署

### 1. 安装 Docker 和 Docker Compose

```bash
# 安装 Docker
curl -fsSL https://get.docker.com | sh

# 启动 Docker 服务
sudo systemctl start docker
sudo systemctl enable docker

# 将当前用户添加到 docker 组（可选，避免每次 sudo）
sudo usermod -aG docker $USER
newgrp docker
```

### 2. 克隆代码并配置环境变量

```bash
# 克隆代码
git clone <your-repo-url>
cd nbnb-pro

# 复制环境变量模板
cp nb-backend/.env.example .env
```

### 3. 编辑 `.env` 文件，配置生产环境变量

```bash
nano .env
```

**必须修改的配置项**:

```bash
# 生产环境
ENVIRONMENT=production

# JWT 密钥（必须修改！生成强随机字符串）
JWT_SECRET_KEY=your-super-secret-key-change-in-production-min-32-chars

# Token 加密密钥（生成方式: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"）
TOKEN_ENCRYPTION_KEY=your-fernet-key-here

# 滑块验证码密钥（必须修改！）
CAPTCHA_SECRET_KEY=your-captcha-secret-key-change-in-production-min-32-chars

# 管理员配置（必须修改！）
ADMIN_EMAIL=your-admin@example.com
ADMIN_PASSWORD=your-strong-password-min-12-chars
ADMIN_EMAILS=your-admin@example.com,another@example.com
ADMIN_NOTIFICATION_EMAILS=admin@example.com

# 邮件配置（阿里云 DirectMail）
ALIYUN_SMTP_USER=your-sender@example.com
ALIYUN_SMTP_PASSWORD=your-smtp-password
ALIYUN_EMAIL_FROM_NAME=YourAppName
ALIYUN_EMAIL_REPLY_TO=your-reply@example.com
```

### 4. 运行部署脚本

```bash
chmod +x deploy.sh
./deploy.sh prod
```

### 5. 验证部署

```bash
# 检查服务状态
docker-compose ps

# 检查后端健康
curl http://localhost:8000/api/health

# 查看日志
docker-compose logs -f
```

## 服务暴露配置

### 使用 Nginx 反向代理（推荐）

在服务器上安装 Nginx 并配置 SSL:

```bash
sudo apt install nginx certbot python3-certbot-nginx
```

创建 Nginx 配置 `/etc/nginx/sites-available/nbnb`:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    client_max_body_size 50M;

    location / {
        proxy_pass http://localhost:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

启用配置并获取 SSL 证书:

```bash
sudo ln -s /etc/nginx/sites-available/nbnb /etc/nginx/sites-enabled/
sudo certbot --nginx -d your-domain.com
sudo systemctl reload nginx
```

### 修改 docker-compose.yml 端口映射

如果使用 Nginx 反向代理，修改端口映射避免冲突:

```yaml
services:
  frontend:
    ports:
      - "127.0.0.1:8080:80"  # 只监听本地，由 Nginx 代理
  backend:
    ports:
      - "127.0.0.1:8000:8000"  # 只监听本地
```

## 数据库管理

### 备份数据库

```bash
# 备份
docker exec nbnb-postgres pg_dump -U postgres nbnb > backup_$(date +%Y%m%d_%H%M%S).sql

# 恢复
docker exec -i nbnb-postgres psql -U postgres nbnb < backup_2024xxxx.sql
```

### 查看数据库

```bash
docker exec -it nbnb-postgres psql -U postgres -d nbnb
```

## 常见问题排查

### 后端 502 错误

1. 检查后端容器是否正常运行:
   ```bash
   docker-compose ps
   docker-compose logs backend
   ```

2. 检查数据库连接:
   ```bash
   docker exec nbnb-postgres pg_isready -U postgres
   ```

3. 检查 Redis 连接:
   ```bash
   docker exec nbnb-redis redis-cli ping
   ```

### 容器启动失败

```bash
# 查看详细日志
docker-compose logs backend

# 重新构建镜像
docker-compose build --no-cache backend
docker-compose up -d
```

### 磁盘空间不足

```bash
# 清理未使用的镜像
docker system prune -a

# 清理构建缓存
docker builder prune
```

## 生成密钥

### 生成 JWT_SECRET_KEY

```bash
openssl rand -base64 32
```

### 生成 TOKEN_ENCRYPTION_KEY

```bash
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

## 安全建议

1. **定期更新系统和 Docker**
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```

2. **配置防火墙**
   ```bash
   sudo ufw allow 22/tcp    # SSH
   sudo ufw allow 80/tcp    # HTTP
   sudo ufw allow 443/tcp   # HTTPS
   sudo ufw enable
   ```

3. **定期备份数据库**
   - 设置 cron 任务每日自动备份

4. **监控服务状态**
   - 考虑使用 Prometheus + Grafana
   - 或简单监控: `docker-compose ps` 定时检查

## 更新部署

```bash
# 拉取最新代码
git pull

# 重新构建并启动
./deploy.sh prod
```
