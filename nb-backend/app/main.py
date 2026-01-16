"""
FastAPI 主入口
"""
import logging
import time
import uuid
import secrets
from contextlib import asynccontextmanager
from fastapi import FastAPI, Response, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration

from app.config import get_settings
from app.database import init_db
from app.routers import auth, user, credit, redeem, proxy, admin, stats, ticket, captcha, conversations, queue, email_config
from app.utils.request_context import request_id_ctx_var, RequestIdFilter, JsonFormatter
from app.utils.metrics import REQUEST_COUNT, REQUEST_LATENCY, IN_PROGRESS, get_route_name

# Initialize settings
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时初始化数据库
    settings.validate_secrets()
    await init_db()
    yield
    # 关闭时清理资源


app = FastAPI(
    title="NanoBanana API",
    description="AI 图片生成平台后端服务",
    version="1.0.0",
    lifespan=lifespan,
)

@app.middleware("http")
async def request_context_middleware(request, call_next):
    request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
    request.state.request_id = request_id
    token = request_id_ctx_var.set(request_id)
    response = None
    start = time.perf_counter()
    if settings.metrics_enabled:
        IN_PROGRESS.inc()

    try:
        response = await call_next(request)
        return response
    finally:
        duration = time.perf_counter() - start
        path = get_route_name(request.scope)
        status_code = response.status_code if response else 500
        if settings.metrics_enabled:
            REQUEST_COUNT.labels(request.method, path, str(status_code)).inc()
            REQUEST_LATENCY.labels(request.method, path).observe(duration)
            IN_PROGRESS.dec()
        request_id_ctx_var.reset(token)
        if response is not None:
            response.headers["X-Request-ID"] = request_id


@app.middleware("http")
async def csrf_middleware(request: Request, call_next):
    safe_methods = {"GET", "HEAD", "OPTIONS"}
    if request.method in safe_methods:
        return await call_next(request)

    if request.url.path in {
        "/api/auth/login",
        "/api/auth/register",
        "/api/auth/send-code",
        "/api/auth/reset-password",
        "/api/captcha/slider/verify",
        "/api/captcha/slider/challenge",
    }:
        return await call_next(request)

    if request.headers.get("authorization") or request.headers.get("x-api-key"):
        return await call_next(request)

    auth_cookie = request.cookies.get(settings.auth_cookie_name)
    if not auth_cookie:
        return await call_next(request)

    csrf_cookie = request.cookies.get(settings.csrf_cookie_name)
    csrf_header = request.headers.get(settings.csrf_header_name)
    if not csrf_cookie or not csrf_header or not secrets.compare_digest(csrf_cookie, csrf_header):
        return JSONResponse(status_code=403, content={"detail": "CSRF token missing or invalid"})

    return await call_next(request)

# CORS 配置
# 注意：生产环境应该通过环境变量配置允许的域名
_allowed_origins = settings.cors_origins if hasattr(settings, 'cors_origins') else [
    "http://localhost",
    "http://localhost:80",
    "http://localhost:3000",
    "http://localhost:5173",
    "https://banana2.peacedejiai.cc",
    "https://nanobanana2.peacedejiai.cc",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=[
        "Content-Type",
        "Authorization",
        "X-Request-ID",
        "X-API-Key",
        "X-Visitor-Id",
        settings.csrf_header_name,
    ],
    expose_headers=["X-Request-ID", "X-Total-Count"],
)

# 注册路由
app.include_router(auth.router, prefix="/api/auth", tags=["认证"])
app.include_router(user.router, prefix="/api/user", tags=["用户"])
app.include_router(credit.router, prefix="/api/credits", tags=["次数"])
app.include_router(redeem.router, prefix="/api/redeem", tags=["兑换码"])
app.include_router(proxy.router, prefix="/api/proxy", tags=["API代理"])
app.include_router(admin.router, prefix="/api/admin", tags=["管理后台"])
app.include_router(queue.router, prefix="/api/admin/queue", tags=["队列监控"])
app.include_router(stats.router, prefix="/api/stats", tags=["统计"])
app.include_router(ticket.router, prefix="/api/tickets", tags=["工单"])
app.include_router(captcha.router, prefix="/api/captcha", tags=["验证码"])
app.include_router(conversations.router, prefix="/api", tags=["对话历史"])
app.include_router(email_config.router, prefix="/api", tags=["邮件配置"])



@app.get("/")
async def root():
    """根路由"""
    return {"message": "NanoBanana API is running", "status": "ok", "docs_url": "/docs"}

@app.get("/api/health")
async def health_check():
    """健康检查"""
    return {"status": "ok", "service": "nbnb-backend"}

@app.get("/metrics")
async def metrics():
    if not settings.metrics_enabled:
        raise HTTPException(status_code=404, detail="Metrics disabled")
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

@app.get("/api/prompts")
async def get_prompts():
    """获取提示词库 (代理)"""
    import httpx
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get("https://raw.githubusercontent.com/glidea/banana-prompt-quicker/main/prompts.json")
            if resp.status_code == 200:
                return resp.json()
    except Exception:
        pass
    
    # Fallback default
    return {"categories": []}


def configure_logging() -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    handler.addFilter(RequestIdFilter())

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(settings.log_level)

    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        logger = logging.getLogger(name)
        logger.handlers = [handler]
        logger.setLevel(settings.log_level)
        logger.propagate = False


def init_sentry() -> None:
    if settings.sentry_dsn:
        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            environment=settings.environment,
            integrations=[FastApiIntegration()],
            traces_sample_rate=settings.sentry_traces_sample_rate,
            profiles_sample_rate=settings.sentry_profiles_sample_rate,
        )


configure_logging()
init_sentry()
