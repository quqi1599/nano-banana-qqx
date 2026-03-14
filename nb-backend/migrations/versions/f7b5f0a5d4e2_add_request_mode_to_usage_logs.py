"""Add request_mode to usage_logs

Revision ID: f7b5f0a5d4e2
Revises: c38e8d05444c
Create Date: 2026-03-15 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f7b5f0a5d4e2'
down_revision: Union[str, None] = 'c38e8d05444c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'usage_logs',
        sa.Column('request_mode', sa.String(length=32), nullable=False, server_default='google_native'),
    )
    op.create_index('ix_usage_logs_request_mode', 'usage_logs', ['request_mode'], unique=False)
    op.alter_column('usage_logs', 'request_mode', server_default=None)


def downgrade() -> None:
    op.drop_index('ix_usage_logs_request_mode', table_name='usage_logs')
    op.drop_column('usage_logs', 'request_mode')
