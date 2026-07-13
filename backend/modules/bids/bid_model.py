import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Numeric,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from common.uuid_type import BinaryUUID

from common.enum import BidStatus


class Bid(Base):
    __tablename__ = "bids"

    __table_args__ = (
        CheckConstraint(
            "amount > 0",
            name="chk_bids_amount",
        ),
        Index(
            "idx_bids_item_created_at",
            "item_id",
            "created_at",
        ),
        Index(
            "idx_bids_item_amount",
            "item_id",
            "amount",
        ),
        Index(
            "idx_bids_bidder_created_at",
            "bidder_id",
            "created_at",
        ),
        Index(
            "idx_bids_item_status",
            "item_id",
            "status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        BinaryUUID(),
        primary_key=True,
        default=uuid.uuid4,
    )

    item_id: Mapped[uuid.UUID] = mapped_column(
        BinaryUUID(),
        ForeignKey(
            "auction_items.id",
            ondelete="RESTRICT",
            onupdate="CASCADE",
        ),
        nullable=False,
    )

    bidder_id: Mapped[uuid.UUID] = mapped_column(
        BinaryUUID(),
        ForeignKey(
            "users.id",
            ondelete="RESTRICT",
            onupdate="CASCADE",
        ),
        nullable=False,
    )

    amount: Mapped[Decimal] = mapped_column(
        Numeric(18, 2),
        nullable=False,
    )

    status: Mapped[BidStatus] = mapped_column(
        Enum(BidStatus, name="bid_status"),
        nullable=False,
        default=BidStatus.OUTBID,
        server_default=BidStatus.OUTBID.value,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
    )

    item = relationship(
        "AuctionItem",
        back_populates="bids",
    )

    bidder = relationship(
        "User",
        back_populates="bids",
    )