"""make item_images image_url nullable

Revision ID: c8d2e5f03a14
Revises: b7e4f1a92c03
Create Date: 2026-07-21 16:45:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c8d2e5f03a14"
down_revision: Union[str, Sequence[str], None] = "b7e4f1a92c03"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "item_images",
        "image_url",
        existing_type=sa.String(length=500),
        nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "item_images",
        "image_url",
        existing_type=sa.String(length=500),
        nullable=False,
    )
