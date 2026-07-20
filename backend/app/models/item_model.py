import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    DECIMAL,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.mysql import ENUM
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.database.types import UUIDString
from app.models.enums import AuctionItemStatus

if TYPE_CHECKING:
    from app.models.session_model import AuctionSession
    from app.models.bid_model import Bid
    from app.models.category_model import Category
    from app.models.image_model import ItemImage
    from app.models.user_model import User


class AuctionItem(
    UUIDPrimaryKeyMixin,
    TimestampMixin,
    Base,
):
    __tablename__ = "auction_items"

    __table_args__ = (
        Index(
            "ix_auction_items_session_status",
            "session_id",
            "status",
        ),
    )

    seller_id: Mapped[uuid.UUID] = mapped_column(
        UUIDString(),
        ForeignKey(
            "users.id",
            name="fk_auction_items_seller",
        ),
        nullable=False,
        index=True,
    )

    session_id: Mapped[uuid.UUID] = mapped_column(
        UUIDString(),
        ForeignKey(
            "auction_sessions.id",
            ondelete="CASCADE",
            name="fk_auction_items_session",
        ),
        nullable=False,
        index=True,
    )

    category_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDString(),
        ForeignKey(
            "categories.id",
            name="fk_auction_items_category",
        ),
        nullable=True,
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

    starting_price: Mapped[Decimal] = mapped_column(
        DECIMAL(18, 2),
        nullable=False,
    )

    current_price: Mapped[Decimal] = mapped_column(
        DECIMAL(18, 2),
        nullable=False,
        default=Decimal("0.00"),
        server_default=text("0.00"),
    )

    status: Mapped[AuctionItemStatus] = mapped_column(
        ENUM(
            AuctionItemStatus,
            name="auction_item_status",
            values_callable=lambda enum: [item.value for item in enum],
        ),
        nullable=False,
        default=AuctionItemStatus.UNSOLD,
        server_default=text("'UNSOLD'"),
        index=True,
    )

    winner_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDString(),
        ForeignKey(
            "users.id",
            name="fk_auction_items_winner",
        ),
        nullable=True,
        index=True,
    )

    final_price: Mapped[Decimal | None] = mapped_column(
        DECIMAL(18, 2),
        nullable=True,
    )

    opened_at: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True,
    )

    closed_at: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True,
    )

    seller: Mapped["User"] = relationship(
        back_populates="selling_items",
        foreign_keys=[seller_id],
    )

    winner: Mapped["User | None"] = relationship(
        back_populates="won_items",
        foreign_keys=[winner_user_id],
    )

    session: Mapped["AuctionSession"] = relationship(
        back_populates="items",
    )

    category: Mapped["Category | None"] = relationship(
        back_populates="auction_items",
    )

    images: Mapped[list["ItemImage"]] = relationship(
        back_populates="item",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="ItemImage.sort_order",
    )

    bids: Mapped[list["Bid"]] = relationship(
        back_populates="item",
        cascade="all, delete-orphan",
    )