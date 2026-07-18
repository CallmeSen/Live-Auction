import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, Text, text
from sqlalchemy.dialects.mysql import ENUM
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.database.types import UUIDBinary
from app.models.enums import AuctionSessionStatus

if TYPE_CHECKING:
    from app.models.auction_item import AuctionItem
    from app.models.auction_session_rule import AuctionSessionRule
    from app.models.bid import Bid
    from app.models.user import User


class AuctionSession(
    UUIDPrimaryKeyMixin,
    TimestampMixin,
    Base,
):
    __tablename__ = "auction_sessions"

    seller_id: Mapped[uuid.UUID] = mapped_column(
        UUIDBinary(),
        ForeignKey(
            "users.id",
            name="fk_auction_sessions_seller",
        ),
        nullable=False,
        index=True,
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
        ENUM(
            AuctionSessionStatus,
            name="auction_session_status",
            values_callable=lambda enum: [item.value for item in enum],
        ),
        nullable=False,
        default=AuctionSessionStatus.SCHEDULED,
        server_default=text("'SCHEDULED'"),
        index=True,
    )

    seller: Mapped["User"] = relationship(
        back_populates="auction_sessions",
        foreign_keys=[seller_id],
    )

    rules: Mapped["AuctionSessionRule | None"] = relationship(
        back_populates="session",
        uselist=False,
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    items: Mapped[list["AuctionItem"]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    bids: Mapped[list["Bid"]] = relationship(
        back_populates="session",
    )