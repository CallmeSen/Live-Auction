import uuid
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import DECIMAL, ForeignKey, Index, text
from sqlalchemy.dialects.mysql import ENUM
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, CreatedAtMixin, UUIDPrimaryKeyMixin
from app.database.types import UUIDBinary
from app.models.enums import BidStatus

if TYPE_CHECKING:
    from app.models.auction_item import AuctionItem
    from app.models.auction_session import AuctionSession
    from app.models.user import User


class Bid(
    UUIDPrimaryKeyMixin,
    CreatedAtMixin,
    Base,
):
    __tablename__ = "bids"

    __table_args__ = (
        Index(
            "ix_bids_item_created_at",
            "item_id",
            "created_at",
        ),
        Index(
            "ix_bids_item_status",
            "item_id",
            "status",
        ),
    )

    item_id: Mapped[uuid.UUID] = mapped_column(
        UUIDBinary(),
        ForeignKey(
            "auction_items.id",
            ondelete="CASCADE",
            name="fk_bids_item",
        ),
        nullable=False,
        index=True,
    )

    session_id: Mapped[uuid.UUID] = mapped_column(
        UUIDBinary(),
        ForeignKey(
            "auction_sessions.id",
            ondelete="CASCADE",
            name="fk_bids_session",
        ),
        nullable=False,
        index=True,
    )

    bidder_id: Mapped[uuid.UUID] = mapped_column(
        UUIDBinary(),
        ForeignKey(
            "users.id",
            name="fk_bids_bidder",
        ),
        nullable=False,
        index=True,
    )

    amount: Mapped[Decimal] = mapped_column(
        DECIMAL(18, 2),
        nullable=False,
    )

    status: Mapped[BidStatus] = mapped_column(
        ENUM(
            BidStatus,
            name="bid_status",
            values_callable=lambda enum: [item.value for item in enum],
        ),
        nullable=False,
        default=BidStatus.OUTBID,
        server_default=text("'OUTBID'"),
        index=True,
    )

    item: Mapped["AuctionItem"] = relationship(
        back_populates="bids",
    )

    session: Mapped["AuctionSession"] = relationship(
        back_populates="bids",
    )

    bidder: Mapped["User"] = relationship(
        back_populates="bids",
        foreign_keys=[bidder_id],
    )