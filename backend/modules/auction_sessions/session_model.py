import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from common.uuid_type import BinaryUUID


from common.enum import AuctionSessionStatus


class AuctionSession(Base):
    __tablename__ = "auction_sessions"

    __table_args__ = (
        CheckConstraint(
            "end_time > start_time",
            name="chk_auction_sessions_time",
        ),
        Index(
            "idx_auction_sessions_seller_id",
            "seller_id",
        ),
        Index(
            "idx_auction_sessions_status",
            "status",
        ),
        Index(
            "idx_auction_sessions_start_time",
            "start_time",
        ),
        Index(
            "idx_auction_sessions_end_time",
            "end_time",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        BinaryUUID(),
        primary_key=True,
        default=uuid.uuid4,
    )

    seller_id: Mapped[uuid.UUID] = mapped_column(
        BinaryUUID(),
        ForeignKey(
            "users.id",
            ondelete="RESTRICT",
            onupdate="CASCADE",
        ),
        nullable=False,
    )

    title: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    start_time: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
    )

    end_time: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
    )

    status: Mapped[AuctionSessionStatus] = mapped_column(
        Enum(
            AuctionSessionStatus,
            name="auction_session_status",
        ),
        nullable=False,
        default=AuctionSessionStatus.SCHEDULED,
        server_default=AuctionSessionStatus.SCHEDULED.value,
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

    seller = relationship(
        "User",
        back_populates="auction_sessions",
    )

    rules = relationship(
        "AuctionSessionRule",
        back_populates="session",
        uselist=False,
        cascade="all, delete-orphan",
    )

    items = relationship(
        "AuctionItem",
        back_populates="session",
        cascade="all, delete-orphan",
    )