"""add_token_pool_base_url

Revision ID: b1c2d3e4f5a6
Revises: aa4369aa85f0
Create Date: 2026-01-12 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


def column_exists(table_name: str, column_name: str) -> bool:
    """Check whether a column exists in the target table."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    try:
        columns = inspector.get_columns(table_name)
    except Exception:
        return False
    return any(col["name"] == column_name for col in columns)


# revision identifiers, used by Alembic.
revision: str = 'b1c2d3e4f5a6'
down_revision: Union[str, None] = 'aa4369aa85f0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if not column_exists("token_pool", "base_url"):
        op.add_column("token_pool", sa.Column("base_url", sa.String(length=500), nullable=True))


def downgrade() -> None:
    if column_exists("token_pool", "base_url"):
        op.drop_column("token_pool", "base_url")
