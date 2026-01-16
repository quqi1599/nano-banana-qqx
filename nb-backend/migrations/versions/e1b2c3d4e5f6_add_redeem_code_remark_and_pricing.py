"""add redeem code remark and refresh model pricing

Revision ID: e1b2c3d4e5f6
Revises: d4f1c7b8a9e0
Create Date: 2025-02-24 10:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "e1b2c3d4e5f6"
down_revision: Union[str, None] = "d4f1c7b8a9e0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(table_name: str, column_name: str) -> bool:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    try:
        columns = inspector.get_columns(table_name)
    except Exception:
        return False
    return any(col["name"] == column_name for col in columns)


def _table_exists(table_name: str) -> bool:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    try:
        return table_name in inspector.get_table_names()
    except Exception:
        return False


def upgrade() -> None:
    if _table_exists("redeem_codes") and not _column_exists("redeem_codes", "remark"):
        op.add_column("redeem_codes", sa.Column("remark", sa.String(length=255), nullable=True))

    if _table_exists("model_pricing"):
        conn = op.get_bind()
        conn.execute(
            sa.text(
                "UPDATE model_pricing SET credits_per_request = :credits WHERE model_name = :name"
            ),
            {"credits": 10, "name": "gemini-3-pro-image-preview"},
        )
        conn.execute(
            sa.text(
                "UPDATE model_pricing SET credits_per_request = :credits WHERE model_name = :name"
            ),
            {"credits": 1, "name": "gemini-2.5-flash-image"},
        )
        # Alembic 会自动管理事务，不需要手动 commit


def downgrade() -> None:
    if _column_exists("redeem_codes", "remark"):
        op.drop_column("redeem_codes", "remark")
