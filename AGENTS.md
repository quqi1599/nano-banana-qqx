# Repository Guidelines

## 项目结构与模块组织
- `nb-app/` 是基于 React 19 + Vite 7 的 Bun 前端，入口在 `src/index.tsx`，UI 组件分布于 `src/components`、状态在 `src/store`、服务层在 `src/services`，Pipeline 模板放在 `public/templates`。
- `nb-backend/` 承载 FastAPI 服务，路由集中在 `app/routers`，配置在 `app/config.py`，迁移通过 Alembic（`migrations/`）管理，工具函数在 `app/utils`，自动化测试在 `tests/`。
- 根目录下的 `docker-compose.yml`、`docker-compose.dev.yml`、`check-env.sh`、`generate-env.sh`、`reset-deploy.sh` 与 `DEPLOY*.md` 统一协调前端、后端、PostgreSQL 和 Redis 的部署流程。

## 构建、测试与开发命令
- 前端：`cd nb-app && bun install`（由 `preinstall` 钩子强制 Bun），`bun dev` 启动开发服务器，`bun build` 生成生产包，`bun preview` 本地预览。
- 后端：`cd nb-backend && python -m venv venv && source venv/bin/activate && pip install -r requirements.txt`，开发前运行 `alembic upgrade head`，再用 `uvicorn app.main:app --reload --port 8000` 启动热更新服务。
- 容器流程：`docker-compose up -d` 启动全部服务、`docker-compose build --no-cache backend` 重建后端、`docker-compose logs -f` 查看日志、`docker-compose ps` 检查状态、`docker exec -it nbnb-backend bash` 进入容器，必要时先执行 `./check-env.sh`、`./generate-env.sh` 和 `./reset-deploy.sh`。

## 编码风格与命名约定
- 前端遵循 `camelCase` 工具、`PascalCase` 组件、Tailwind CSS 4 的公用类，类型集中在 `types.ts`，保持 `services`/`store`/`utils` 目录划分，类名和钩子保持语义化（如 `syncCurrentMessage`）。
- 后端倾向每行 4 个空格缩进、`snake_case` 函数名、`logging.getLogger(__name__)` 记录、简洁注释，按路由拆分模块至 `app/routers`，环境变量使用大写与下划线，如 `JWT_SECRET_KEY` 与 `TOKEN_ENCRYPTION_KEY`。

## 测试指南
- 使用 `python -m pytest nb-backend/tests` 运行后端测试，文件采用 `test_*.py` 命名（例如 `tests/test_proxy_non_json.py`），行为由 `pytest.ini` 控制。
- 前端当前无自动化测试，因此需通过 `bun dev` 或 `bun preview` 校验关键流程（登录、Pipeline 面板、图片上传），并在 PR 描述中记录手动验证步骤。

## 提交与拉取请求规范
- 虽然历史提交多为 `update`，请改用描述性现在时总结，如 `frontend: tidy pipeline modal` 或 `backend: guard refund flow`。
- PR 需包含概要、测试清单（自动或手动）、关联 issue（如有）和界面变更的截图，凡涉及迁移、`.env` 新字段或秘密，都要在 PR 说明中提醒审阅者。

## 安全与配置提示
- 复制 `.env.production.example` 为 `.env`，填入必需的密钥（`POSTGRES_PASSWORD` ≥ 16 个字符，`JWT_SECRET_KEY`/`TOKEN_ENCRYPTION_KEY` ≥ 32 个字符）；不要提交包含敏感信息的文件。
- `DEPLOYMENT_NOTES.md` 提醒后端只依赖 `alembic upgrade head`，避免再次调用 `Base.metadata.create_all()`，调试后端请先用 `docker-compose build --no-cache backend` 重新构建迁移代码。
- 更新静态资源时通过添加参数版本号（如 `public/wechat-group.jpg?v=2`）缓存清除，并在上线前再跑一次 `docker-compose build --no-cache frontend`。
