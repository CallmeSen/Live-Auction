"""add primary admin flag

Revision ID: d4a9f1c72b10
Revises: c8d2e5f03a14
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d4a9f1c72b10"
down_revision: Union[str, None] = "c8d2e5f03a14"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "is_primary_admin",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )
    op.execute(
        """
        UPDATE users
        SET is_primary_admin = 1
        WHERE id = (
            SELECT id
            FROM (
                SELECT id
                FROM users
                WHERE role = 'ADMIN'
                ORDER BY created_at ASC, id ASC
                LIMIT 1
            ) AS first_admin
        )
        """
    )


def downgrade() -> None:
    op.drop_column("users", "is_primary_admin")
