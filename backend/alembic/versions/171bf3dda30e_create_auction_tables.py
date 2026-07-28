"""create auction tables

Revision ID: 171bf3dda30e
Revises:
Create Date: 2026-07-18 12:12:51.718255

"""
from typing import Sequence, Union

from alembic import op

import app.models  # noqa: F401
from app.database.base import Base

# revision identifiers, used by Alembic.
revision: str = "171bf3dda30e"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create all tables from the current SQLAlchemy models."""
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)


def downgrade() -> None:
    """Drop all application tables."""
    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind)
