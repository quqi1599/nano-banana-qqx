"""Add visitors table and conversation custom_endpoint

Revision ID: d44d3f13f0cc
Revises: 9ecec3fb6139
Create Date: 2026-01-16 23:10:56.614090

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


def table_exists(table_name: str) -> bool:
    """检查表是否已存在"""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    return table_name in inspector.get_table_names()


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


# revision identifiers, used by Alembic.
revision: str = 'd44d3f13f0cc'
down_revision: Union[str, None] = '9ecec3fb6139'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. 创建 visitors 表
    if not table_exists('visitors'):
        op.create_table(
            'visitors',
            sa.Column('id', sa.String(length=36), nullable=False),
            sa.Column('visitor_id', sa.String(length=36), nullable=False, unique=True),
            sa.Column('custom_endpoint', sa.String(length=500), nullable=True),
            sa.Column('conversation_count', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('message_count', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('image_count', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('first_seen', sa.DateTime(), nullable=False),
            sa.Column('last_seen', sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint('id')
        )
    # 创建索引（如已存在则跳过）
    if not index_exists('visitors', 'ix_visitors_visitor_id'):
        op.create_index('ix_visitors_visitor_id', 'visitors', ['visitor_id'], unique=True)
    if not index_exists('visitors', 'ix_visitors_custom_endpoint'):
        op.create_index('ix_visitors_custom_endpoint', 'visitors', ['custom_endpoint'])

    # 2. 添加 conversations.custom_endpoint 字段
    if not column_exists('conversations', 'custom_endpoint'):
        op.add_column('conversations', sa.Column('custom_endpoint', sa.String(length=500), nullable=True))


def downgrade() -> None:
    # 删除 visitors 表
    if table_exists('visitors'):
        if index_exists('visitors', 'ix_visitors_custom_endpoint'):
            op.drop_index('ix_visitors_custom_endpoint', table_name='visitors')
        if index_exists('visitors', 'ix_visitors_visitor_id'):
            op.drop_index('ix_visitors_visitor_id', table_name='visitors')
        op.drop_table('visitors')

    # 删除 conversations.custom_endpoint 字段
    if column_exists('conversations', 'custom_endpoint'):
        op.drop_column('conversations', 'custom_endpoint')
