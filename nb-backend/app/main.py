"""
FastAPI 主入口
"""
import logging
import time
import uuid
import secrets
from contextlib import asynccontextmanager
from fastapi import FastAPI, Response, HTTPException, Request, status, Depends
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration

from app.config import get_settings
from app.database import init_db
from app.routers import auth, user, credit, redeem, proxy, admin, stats, ticket, captcha, conversations, queue, email_config
from app.utils.request_context import request_id_ctx_var, RequestIdFilter, JsonFormatter
from app.utils.metrics import REQUEST_COUNT, REQUEST_LATENCY, IN_PROGRESS, get_route_name
from app.utils.security import verify_metrics_basic_auth

# Initialize settings
settings = get_settings()
logger = logging.getLogger(__name__)


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

@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "status": "error",
            "message": exc.detail,
            "code": exc.status_code
        },
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "status": "error",
            "message": "Validation Error",
            "details": exc.errors(),
            "code": 422
        },
    )

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Global exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "status": "error",
            "message": "Internal Server Error",
            "code": 500
        },
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
        # V1 API 路径
        "/api/v1/auth/login",
        "/api/v1/auth/register",
        "/api/v1/auth/send-code",
        "/api/v1/auth/reset-password",
        "/api/v1/captcha/slider/verify",
        "/api/v1/captcha/slider/challenge",
    }:
        return await call_next(request)

    # 验证 Authorization 或 X-API-Key 头存在且格式正确
    # 防止攻击者发送空或伪造的头部来绕过 CSRF 检查
    auth_header = request.headers.get("authorization", "")
    api_key_header = request.headers.get("x-api-key", "")

    # 检查 Authorization 头格式 (Bearer <token>)
    has_valid_auth = False
    if auth_header:
        if auth_header.startswith("Bearer ") and len(auth_header) > 7:
            has_valid_auth = True
        else:
            logger.warning(f"无效的 Authorization 头格式: {auth_header[:20]}...")

    # 检查 X-API-Key 头不为空
    has_valid_api_key = bool(api_key_header and api_key_header.strip())

    if has_valid_auth or has_valid_api_key:
        # 头部存在且格式正确，跳过 CSRF 验证
        # 注意：实际的有效性会在路由层由依赖项验证
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

# ============================================================================
# API 版本控制
# 所有 API 路由都在 /api/v1/ 前缀下
# 未来升级时可以添加 /api/v2/ 同时保留旧版本
# ============================================================================

# V1 API 路由
API_V1_PREFIX = "/api/v1"

# 注册 V1 版本路由
app.include_router(auth.router, prefix=f"{API_V1_PREFIX}/auth", tags=["V1-认证"])
app.include_router(user.router, prefix=f"{API_V1_PREFIX}/user", tags=["V1-用户"])
app.include_router(credit.router, prefix=f"{API_V1_PREFIX}/credits", tags=["V1-次数"])
app.include_router(redeem.router, prefix=f"{API_V1_PREFIX}/redeem", tags=["V1-兑换码"])
app.include_router(proxy.router, prefix=f"{API_V1_PREFIX}/proxy", tags=["V1-API代理"])
app.include_router(admin.router, prefix=f"{API_V1_PREFIX}/admin", tags=["V1-管理后台"])
app.include_router(queue.router, prefix=f"{API_V1_PREFIX}/admin/queue", tags=["V1-队列监控"])
app.include_router(stats.router, prefix=f"{API_V1_PREFIX}/stats", tags=["V1-统计"])
app.include_router(ticket.router, prefix=f"{API_V1_PREFIX}/tickets", tags=["V1-工单"])
app.include_router(captcha.router, prefix=f"{API_V1_PREFIX}/captcha", tags=["V1-验证码"])
app.include_router(conversations.router, prefix=API_V1_PREFIX, tags=["V1-对话历史"])
app.include_router(email_config.router, prefix=API_V1_PREFIX, tags=["V1-邮件配置"])

# 为了向后兼容，保留旧的 /api/ 路径（可以选择在未来版本中移除）
# 建议前端逐步迁移到 /api/v1/ 路径
app.include_router(auth.router, prefix="/api/auth", tags=["认证-Deprecated", "使用 /api/v1/auth"])
app.include_router(user.router, prefix="/api/user", tags=["用户-Deprecated", "使用 /api/v1/user"])
app.include_router(credit.router, prefix="/api/credits", tags=["次数-Deprecated", "使用 /api/v1/credits"])
app.include_router(redeem.router, prefix="/api/redeem", tags=["兑换码-Deprecated", "使用 /api/v1/redeem"])
app.include_router(proxy.router, prefix="/api/proxy", tags=["API代理-Deprecated", "使用 /api/v1/proxy"])
app.include_router(admin.router, prefix="/api/admin", tags=["管理后台-Deprecated", "使用 /api/v1/admin"])
app.include_router(queue.router, prefix="/api/admin/queue", tags=["队列监控-Deprecated", "使用 /api/v1/admin/queue"])
app.include_router(stats.router, prefix="/api/stats", tags=["统计-Deprecated", "使用 /api/v1/stats"])
app.include_router(ticket.router, prefix="/api/tickets", tags=["工单-Deprecated", "使用 /api/v1/tickets"])
app.include_router(captcha.router, prefix="/api/captcha", tags=["验证码-Deprecated", "使用 /api/v1/captcha"])
app.include_router(conversations.router, prefix="/api", tags=["对话历史-Deprecated", "使用 /api/v1"])
app.include_router(email_config.router, prefix="/api", tags=["邮件配置-Deprecated", "使用 /api/v1"])



@app.get("/")
async def root():
    """根路由"""
    return {"message": "NanoBanana API is running", "status": "ok", "docs_url": "/docs"}

@app.get("/api/health")
@app.get("/api/v1/health")
async def health_check():
    """
    健康检查端点

    Returns:
        服务状态信息
    """
    return {
        "status": "ok",
        "service": "nbnb-backend",
        "version": "1.0.0",
        "api_version": "v1"
    }

@app.get("/metrics", dependencies=[Depends(verify_metrics_basic_auth)])
async def metrics():
    """Prometheus 指标端点（支持 Basic Auth 认证）"""
    if not settings.metrics_enabled:
        raise HTTPException(status_code=404, detail="Metrics disabled")
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

@app.get("/api/prompts")
@app.get("/api/v1/prompts")
async def get_prompts():
    """
    获取提示词库 (代理)

    从 GitHub 代理获取提示词库数据。

    Returns:
        提示词分类列表
    """
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
