"""
数据库连接模块
"""
from pathlib import Path
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import inspect, text
from sqlalchemy.orm import DeclarativeBase
from app.config import get_settings

settings = get_settings()

# 将 postgresql:// 转换为 postgresql+asyncpg://
# 将 postgresql:// 转换为 postgresql+asyncpg://
if settings.database_url.startswith("postgresql://"):
    database_url = settings.database_url.replace(
        "postgresql://", "postgresql+asyncpg://", 1
    )
elif settings.database_url.startswith("postgres://"):
    database_url = settings.database_url.replace(
        "postgres://", "postgresql+asyncpg://", 1
    )
else:
    database_url = settings.database_url

engine = create_async_engine(
    database_url,
    echo=False,
    pool_pre_ping=True,
    pool_size=settings.db_pool_size,
    max_overflow=settings.db_max_overflow,
    pool_timeout=settings.db_pool_timeout,
    pool_recycle=settings.db_pool_recycle,
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


def get_db_session():
    """获取数据库会话 (用于后台任务等非依赖注入场景)"""
    return AsyncSessionLocal()


async def init_db():
    """初始化数据库表"""
    print("🔧 Initializing database...")
    # 先导入所有模型，确保它们注册到 Base.metadata
    import app.models  # noqa: F401
    
    # 首次部署时需要创建所有表
    # create_all() 会跳过已存在的表，所以可以安全地每次都调用
    print("📋 Creating tables if not exist...")
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            await conn.run_sync(_ensure_conversation_api_key_column)
        print("✅ Tables created/verified")
    except Exception as e:
        print(f"❌ Failed to create tables: {e}")
        raise

    print("💰 Seeding model pricing...")
    try:
        await seed_model_pricing()
        print("✅ Model pricing seeded")
    except Exception as e:
        print(f"❌ Failed to seed model pricing: {e}")
        raise
    
    print("👤 Seeding admin user...")
    try:
        await seed_admin_user()
        print("✅ Admin user seeded")
    except Exception as e:
        print(f"❌ Failed to seed admin user: {e}")
        raise
    
    print("🎉 Database initialization complete!")


def _ensure_conversation_api_key_column(conn) -> None:
    """确保 conversations 表包含 api_key 列"""
    inspector = inspect(conn)
    columns = {col["name"] for col in inspector.get_columns("conversations")}
    if "api_key" in columns:
        return
    conn.execute(text("ALTER TABLE conversations ADD COLUMN api_key TEXT"))


async def seed_admin_user():
    """确保默认管理员账号存在"""
    from sqlalchemy import select
    from app.models.user import User
    from app.utils.security import get_password_hash
    
    if not settings.admin_emails_list or not settings.admin_password:
        print("WARNING: Skipping admin seed; configure ADMIN_EMAILS and ADMIN_PASSWORD.")
        return

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(User).where(User.email == settings.primary_admin_email)
        )
        if result.scalar_one_or_none():
            return
        
        admin = User(
            email=settings.primary_admin_email,
            password_hash=get_password_hash(settings.admin_password),
            nickname="管理员",
            is_admin=True,
            credit_balance=settings.admin_seed_credit_balance,
        )
        session.add(admin)
        await session.commit()
        print(f"✅ Admin user created: {settings.primary_admin_email}")


async def seed_model_pricing():
    """确保默认模型计费存在"""
    from sqlalchemy import select
    from app.models.model_pricing import ModelPricing

    default_pricing = {
        "gemini-3-pro-image-preview": settings.credits_gemini_3_pro,
        "gemini-3.1-flash-image-preview": settings.credits_gemini_25_flash,
        "gemini-2.5-flash-image-preview": settings.credits_gemini_25_flash,
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
