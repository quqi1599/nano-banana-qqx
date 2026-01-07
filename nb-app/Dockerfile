# 构建阶段
FROM oven/bun:1.2 AS builder

WORKDIR /app

# 复制依赖文件
COPY package.json bun.lock ./

# 安装依赖
RUN bun install --frozen-lockfile

# 复制源代码
COPY . .

# 构建生产版本
RUN bun run build

# 生产阶段 - 使用 nginx 作为静态服务器 + API 反向代理
FROM nginx:alpine

# 复制构建产物到 nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# 复制自定义 nginx 配置（支持 SPA 路由 + API 代理绕过 CORS）
RUN echo 'server { \
    listen 80; \
    server_name localhost; \
    root /usr/share/nginx/html; \
    index index.html; \
    \
    # API 反向代理 - 解决 CORS 问题 \
    location /gemini-api/ { \
    # 从请求头获取目标端点，默认使用环境变量或默认值 \
    set $target_endpoint "https://nanobanana2.peacedejiai.cc"; \
    \
    # 移除 /gemini-api 前缀后转发 \
    rewrite ^/gemini-api/(.*) /$1 break; \
    \
    proxy_pass $target_endpoint; \
    proxy_ssl_server_name on; \
    proxy_set_header Host $proxy_host; \
    proxy_set_header X-Real-IP $remote_addr; \
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
    proxy_set_header X-Forwarded-Proto $scheme; \
    \
    # 处理大请求体（图片上传） \
    client_max_body_size 50M; \
    proxy_connect_timeout 60s; \
    proxy_send_timeout 120s; \
    proxy_read_timeout 120s; \
    } \
    \
    # SPA 路由 \
    location / { \
    try_files $uri $uri/ /index.html; \
    } \
    \
    # 静态资源缓存 \
    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ { \
    expires 1y; \
    add_header Cache-Control "public, immutable"; \
    } \
    }' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
