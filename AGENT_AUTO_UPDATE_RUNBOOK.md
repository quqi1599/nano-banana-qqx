# 服务器自动化更新运行文档（Agent）

适用仓库：`nano-banana-qqx`  
适用分支：`main`  
服务器目录：`/home/ubuntu/nano-banana-qqx`

## 1. 目标
- 本地开发提交到 GitHub 后，服务器通过 Agent 脚本自动拉取并发布。
- 默认更新服务：`frontend`、`backend`、`celery-worker`。
- 发布失败时不破坏线上可用状态，优先保留当前可运行容器。

## 2. 先决条件
- 服务器已安装并可用：`git`、`docker`、`docker compose`。
- 仓库远程配置正确：`origin=https://github.com/quqi1599/nano-banana-qqx.git`。
- `.env` 已配置完成（至少包含数据库、JWT、Redis 等必需项）。
- Redis 与 PostgreSQL 仅本机绑定（建议）：
  - `127.0.0.1:6379:6379`
  - `127.0.0.1:5432:5432`

## 3. 标准自动发布流程
1. 进入目录并加锁（防止并发发布）。
2. `git fetch origin --prune`。
3. 比较 `HEAD` 与 `origin/main`：
   - 相同：直接退出（无更新）。
   - 不同：继续发布。
4. 检查工作区是否干净（`git diff --quiet`）：
   - 不干净：退出并告警（避免覆盖人工改动）。
5. `git pull --ff-only origin main`。
6. 构建镜像：`docker compose build frontend backend celery-worker`。
7. 启动更新：`docker compose up -d frontend backend celery-worker`。
8. 健康检查：
   - `curl -fsS http://127.0.0.1:8000/api/health`
   - `curl -fsS http://127.0.0.1/`
   - `docker compose ps`
9. 成功后解锁并记录版本号。

## 4. Agent 可直接调用的一次性命令
```bash
cd /home/ubuntu/nano-banana-qqx && \
flock -n /tmp/nbnb-deploy.lock bash -lc '
set -euo pipefail

git fetch origin --prune
LOCAL_SHA="$(git rev-parse HEAD)"
REMOTE_SHA="$(git rev-parse origin/main)"

echo "[deploy] local=$LOCAL_SHA remote=$REMOTE_SHA"
if [ "$LOCAL_SHA" = "$REMOTE_SHA" ]; then
  echo "[deploy] no update"
  exit 0
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "[deploy] working tree not clean, abort"
  exit 20
fi

git pull --ff-only origin main

docker compose build frontend backend celery-worker
docker compose up -d frontend backend celery-worker

curl -fsS http://127.0.0.1:8000/api/health >/dev/null
curl -fsS http://127.0.0.1/ >/dev/null

docker compose ps
echo "[deploy] success $(git rev-parse HEAD)"
'
```

## 5. Agent 脚本建议参数
可在现有 Agent 脚本中支持以下参数：
- `APP_DIR`：默认 `/home/ubuntu/nano-banana-qqx`
- `BRANCH`：默认 `main`
- `SERVICES`：默认 `frontend backend celery-worker`
- `FORCE_NO_CACHE`：`1` 时使用 `docker compose build --no-cache ...`
- `SKIP_HEALTHCHECK`：`1` 时跳过 `curl` 检查（不建议）

## 6. 发布失败处理
先看日志定位，不要立刻清库：
```bash
cd /home/ubuntu/nano-banana-qqx

docker compose ps
docker compose logs --tail=200 backend celery-worker frontend
```

若需要人工回滚到上一稳定提交（示例）：
```bash
cd /home/ubuntu/nano-banana-qqx
git log --oneline -n 10
# 选择一个稳定提交 SHA，例如 abc1234

git checkout abc1234
docker compose build frontend backend celery-worker
docker compose up -d frontend backend celery-worker
```

回滚后会处于 detached HEAD。恢复主线时：
```bash
git checkout main
git pull --ff-only origin main
```

## 7. 每周微信群二维码更新（已做防缓存）
当前二维码走打包资源，更新无需改版本号：
- 文件路径：`nb-app/src/assets/wechat-group.jpg`
- 只要替换该文件并提交，发布后会生成新 hash URL，用户端自动拿新图。

本地更新示例：
```bash
cd /Users/qinxian/code/nbnb-pro/nbnb-pro
cp "<新二维码图片路径>" nb-app/src/assets/wechat-group.jpg
git add nb-app/src/assets/wechat-group.jpg
# 如有文案更新，再 add: nb-app/src/components/WeChatQRModal.tsx
```

## 8. 上线后核对清单
- 首页可打开：`https://banana2.peacedejiai.cc`
- 后端健康检查返回 200：`/api/health`
- 模型生成可用（3.0 / 3.1 / 2.5）
- 微信群二维码弹窗显示最新图
- `docker compose ps` 中核心容器状态为 `Up`

## 9. 备注
- 自动化发布建议仅用于生产专用目录，不在该目录进行手工临时改代码。
- 密钥（GitHub Token、Redis 密码、API Key）不要写入日志或文档截图。
