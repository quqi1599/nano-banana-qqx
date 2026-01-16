"""Add conversation api_key_prefix field

Revision ID: f1e2g3h4i5j6
Revises: d44d3f13f0cc
Create Date: 2026-01-17 10:00:00.000000

会话记录分组优化：
- 登录用户：按 user_id 分组
- 未登录 + 默认URL：归入"淘宝用户"组
- 未登录 + 自定义URL/API：按 api_key_prefix 分组
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f1e2g3h4i5j6'
down_revision: Union[str, None] = 'd44d3f13f0cc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def column_exists(table_name: str, column_name: str) -> bool:
    """检查列是否已存在"""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if table_name not in inspector.get_table_names():
        return False
    return any(column["name"] == column_name for column in inspector.get_columns(table_name))


def index_exists(table_name: str, index_name: str) -> bool:
    """检查索引是否已存在"""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if table_name not in inspector.get_table_names():
        return False
    return any(index["name"] == index_name for index in inspector.get_indexes(table_name))


def upgrade() -> None:
    # 添加 api_key_prefix 列到 conversations 表
    if not column_exists('conversations', 'api_key_prefix'):
        op.add_column('conversations', sa.Column('api_key_prefix', sa.String(length=20), nullable=True))

    # 创建索引以支持按 api_key_prefix 分组查询
    if not index_exists('conversations', 'ix_conversations_api_key_prefix'):
        op.create_index('ix_conversations_api_key_prefix', 'conversations', ['api_key_prefix'])


def downgrade() -> None:
    # 删除索引
    if index_exists('conversations', 'ix_conversations_api_key_prefix'):
        op.drop_index('ix_conversations_api_key_prefix', table_name='conversations')

    # 删除列
    if column_exists('conversations', 'api_key_prefix'):
        op.drop_column('conversations', 'api_key_prefix')
