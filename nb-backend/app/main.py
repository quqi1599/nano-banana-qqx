"""
FastAPI 主入口
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db
from app.routers import auth, user, credit, redeem, proxy, admin, stats, ticket


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时初始化数据库
    await init_db()
    yield
    # 关闭时清理资源


app = FastAPI(
    title="NanoBanana API",
    description="AI 图片生成平台后端服务",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "https://banana2.peacedejiai.cc",
        "https://nanobanana2.peacedejiai.cc",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(auth.router, prefix="/api/auth", tags=["认证"])
app.include_router(user.router, prefix="/api/user", tags=["用户"])
app.include_router(credit.router, prefix="/api/credits", tags=["积分"])
app.include_router(redeem.router, prefix="/api/redeem", tags=["兑换码"])
app.include_router(proxy.router, prefix="/api/proxy", tags=["API代理"])
app.include_router(admin.router, prefix="/api/admin", tags=["管理后台"])
app.include_router(stats.router, prefix="/api/stats", tags=["统计"])
app.include_router(ticket.router, prefix="/api/tickets", tags=["工单"])


@app.get("/api/health")
async def health_check():
    """健康检查"""
    return {"status": "ok", "service": "nbnb-backend"}
