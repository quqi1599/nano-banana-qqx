import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

# 导入模型和配置
import sys
from pathlib import Path

# 添加项目根目录到 Python 路径
sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.config import get_settings
from app.database import Base

# 只导入需要的模型，避免导入有问题的 EmailConfig
from app.models.user import User
from app.models.redeem_code import RedeemCode
from app.models.credit import CreditTransaction
from app.models.model_pricing import ModelPricing
from app.models.email_code import EmailCode
from app.models.ticket import Ticket, TicketMessage
from app.models.token_pool import TokenPool
from app.models.usage_log import UsageLog
from app.models.login_history import LoginHistory
from app.models.email_whitelist import EmailWhitelist
from app.models.conversation import Conversation, ConversationMessage
from app.models.conversation_cleanup import ConversationCleanup

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# 从配置获取数据库 URL
settings = get_settings()
# 将 postgresql:// 转换为 postgresql+asyncpg:// 供 Alembic 使用
database_url = settings.database_url.replace(
    "postgresql://", "postgresql+asyncpg://"
)
config.set_main_option("sqlalchemy.url", database_url)

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# add your model's MetaData object here
# for 'autogenerate' support
target_metadata = Base.metadata

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Run migrations in 'online' mode with async support.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
