import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Numeric,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from common.uuid_type import BinaryUUID


class AuctionSessionRule(Base):
    __tablename__ = "auction_session_rules"

    __table_args__ = (
        UniqueConstraint(
            "session_id",
            name="uk_auction_session_rules_session",
        ),
        CheckConstraint(
            "min_increment > 0",
            name="chk_auction_session_rules_min_increment",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        BinaryUUID(),
        primary_key=True,
        default=uuid.uuid4,
    )

    session_id: Mapped[uuid.UUID] = mapped_column(
        BinaryUUID(),
        ForeignKey(
            "auction_sessions.id",
            ondelete="CASCADE",
            onupdate="CASCADE",
        ),
        nullable=False,
    )

    min_increment: Mapped[Decimal] = mapped_column(
        Numeric(18, 2),
        nullable=False,
        default=Decimal("1.00"),
        server_default="1.00",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    session = relationship(
        "AuctionSession",
        back_populates="rules",
    )