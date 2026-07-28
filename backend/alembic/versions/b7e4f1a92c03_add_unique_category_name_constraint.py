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
    """Skipped: constraints are created in 171bf3dda30e."""
    pass


def downgrade() -> None:
    """Skipped: see 171bf3dda30e downgrade."""
    pass
