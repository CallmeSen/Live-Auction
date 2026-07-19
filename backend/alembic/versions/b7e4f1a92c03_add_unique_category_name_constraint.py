"""add unique category name constraint

Revision ID: b7e4f1a92c03
Revises: a3f8c2d91e04
Create Date: 2026-07-19 12:50:00.000000

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b7e4f1a92c03"
down_revision: Union[str, Sequence[str], None] = "a3f8c2d91e04"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_unique_constraint(
        "uq_categories_name",
        "categories",
        ["name"],
    )
    op.create_index(
        "ix_categories_status",
        "categories",
        ["status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_categories_status", table_name="categories")
    op.drop_constraint("uq_categories_name", "categories", type_="unique")
