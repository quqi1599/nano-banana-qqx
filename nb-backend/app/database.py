"""
数据库连接模块
"""
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


async def init_db():
    """初始化数据库表"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await seed_model_pricing()
    await seed_admin_user()


async def seed_admin_user():
    """确保默认管理员账号存在"""
    from sqlalchemy import select
    from app.models.user import User
    from app.utils.security import get_password_hash
    
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
        "gemini-3-pro-image-preview": settings.credits_gemini_3_pro,
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

