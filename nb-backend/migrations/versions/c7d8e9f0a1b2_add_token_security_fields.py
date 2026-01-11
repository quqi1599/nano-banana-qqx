"""add token security fields

Revision ID: c7d8e9f0a1b2
Revises: b1c2d3e4f5a6
Create Date: 2025-02-14 12:00:00.000000
"""

from typing import Sequence, Union
from hashlib import sha256

from alembic import op
import sqlalchemy as sa

revision: str = "c7d8e9f0a1b2"
down_revision: Union[str, None] = "b1c2d3e4f5a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("token_pool_api_key_key", "token_pool", type_="unique")
    op.alter_column(
        "token_pool",
        "api_key",
        existing_type=sa.String(length=255),
        type_=sa.Text(),
        existing_nullable=False,
    )
    op.add_column("token_pool", sa.Column("api_key_hash", sa.String(length=64), nullable=True))
    op.add_column("token_pool", sa.Column("api_key_prefix", sa.String(length=16), nullable=True))
    op.add_column("token_pool", sa.Column("api_key_suffix", sa.String(length=8), nullable=True))
    op.add_column("token_pool", sa.Column("failure_count", sa.Integer(), server_default="0", nullable=False))
    op.add_column("token_pool", sa.Column("cooldown_until", sa.DateTime(), nullable=True))
    op.add_column("token_pool", sa.Column("last_failure_at", sa.DateTime(), nullable=True))

    connection = op.get_bind()
    rows = connection.execute(sa.text("SELECT id, api_key FROM token_pool")).fetchall()
    for row in rows:
        token_id = row[0]
        api_key = row[1] or ""
        key_hash = sha256(api_key.encode()).hexdigest() if api_key else None
        prefix = api_key[:8] if api_key else None
        suffix = api_key[-4:] if api_key else None
        connection.execute(
            sa.text(
                "UPDATE token_pool SET api_key_hash = :h, api_key_prefix = :p, api_key_suffix = :s WHERE id = :id"
            ),
            {"h": key_hash, "p": prefix, "s": suffix, "id": token_id},
        )

    op.create_unique_constraint("token_pool_api_key_hash_key", "token_pool", ["api_key_hash"])


def downgrade() -> None:
    op.drop_constraint("token_pool_api_key_hash_key", "token_pool", type_="unique")
    op.drop_column("token_pool", "last_failure_at")
    op.drop_column("token_pool", "cooldown_until")
    op.drop_column("token_pool", "failure_count")
    op.drop_column("token_pool", "api_key_suffix")
    op.drop_column("token_pool", "api_key_prefix")
    op.drop_column("token_pool", "api_key_hash")
    op.alter_column(
        "token_pool",
        "api_key",
        existing_type=sa.Text(),
        type_=sa.String(length=255),
        existing_nullable=False,
    )
    op.create_unique_constraint("token_pool_api_key_key", "token_pool", ["api_key"])
