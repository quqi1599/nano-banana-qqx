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

# 复制自定义 nginx 配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
