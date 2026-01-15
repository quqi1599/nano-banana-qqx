"""
数据库连接模块
"""
import asyncio
from pathlib import Path
from alembic import command
from alembic.config import Config
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.config import get_settings

settings = get_settings()

# 将 postgresql:// 转换为 postgresql+asyncpg://
database_url = settings.database_url.replace(
    "postgresql://", "postgresql+asyncpg://"
)

engine = create_async_engine(
    database_url,
    echo=False,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    """SQLAlchemy 基类"""
    pass


async def get_db():
    """获取数据库会话依赖"""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


def run_migrations() -> None:
    """运行 Alembic 数据库迁移"""
    config_path = Path(__file__).resolve().parents[1] / "alembic.ini"
    alembic_cfg = Config(str(config_path))
    command.upgrade(alembic_cfg, "head")


async def init_db():
    """初始化数据库表"""
    # 先导入所有模型，确保它们注册到 Base.metadata
    from app.models import user, token_pool, redeem_code, usage_log, model_pricing, credit, ticket, conversation, login_history, admin_audit_log  # noqa: F401
    
    # 创建基础表结构（如果不存在）
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    # 运行 Alembic 迁移（处理增量变更）
    await asyncio.to_thread(run_migrations)
    await seed_model_pricing()
    await seed_admin_user()


async def seed_admin_user():
    """确保默认管理员账号存在"""
    from sqlalchemy import select
    from app.models.user import User
    from app.utils.security import get_password_hash
    
    if not settings.admin_email or not settings.admin_password:
        print("WARNING: Skipping admin seed; configure ADMIN_EMAIL and ADMIN_PASSWORD.")
        return

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(User).where(User.email == settings.admin_email)
        )
        if result.scalar_one_or_none():
            return
        
        admin = User(
            email=settings.admin_email,
            password_hash=get_password_hash(settings.admin_password),
            nickname="管理员",
            is_admin=True,
            credit_balance=999999,
        )
        session.add(admin)
        await session.commit()
        print(f"✅ Admin user created: {settings.admin_email}")


async def seed_model_pricing():
    """确保默认模型计费存在"""
    from sqlalchemy import select
    from app.models.model_pricing import ModelPricing

    default_pricing = {
        "gemini-3-pro-image-preview": settings.credits_gemini_30_pro,
        "gemini-2.5-flash-image": settings.credits_gemini_25_flash,
    }

    async with AsyncSessionLocal() as session:
        for model_name, credits in default_pricing.items():
            result = await session.execute(
                select(ModelPricing).where(ModelPricing.model_name == model_name)
            )
            if result.scalar_one_or_none():
                continue
            session.add(ModelPricing(model_name=model_name, credits_per_request=credits))
        await session.commit()
