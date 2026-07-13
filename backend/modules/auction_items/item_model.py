import enum
import uuid
from datetime import datetime
from decimal import Decimal
from common.enum import AuctionItemStatus

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from common.uuid_type import BinaryUUID


class AuctionItem(Base):
    __tablename__ = "auction_items"

    __table_args__ = (
        CheckConstraint(
            "starting_price >= 0",
            name="chk_auction_items_starting_price",
        ),
        CheckConstraint(
            "current_price IS NULL OR current_price >= starting_price",
            name="chk_auction_items_current_price",
        ),
        CheckConstraint(
            "final_price IS NULL OR final_price >= starting_price",
            name="chk_auction_items_final_price",
        ),
        CheckConstraint(
            """
            closed_at IS NULL
            OR opened_at IS NULL
            OR closed_at >= opened_at
            """,
            name="chk_auction_items_open_close_time",
        ),
        Index(
            "idx_auction_items_session_id",
            "session_id",
        ),
        Index(
            "idx_auction_items_category_id",
            "category_id",
        ),
        Index(
            "idx_auction_items_status",
            "status",
        ),
        Index(
            "idx_auction_items_winner_user_id",
            "winner_user_id",
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

    category_id: Mapped[uuid.UUID | None] = mapped_column(
        BinaryUUID(),
        ForeignKey(
            "categories.id",
            ondelete="SET NULL",
            onupdate="CASCADE",
        ),
        nullable=True,
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
        Numeric(18, 2),
        nullable=False,
    )

    current_price: Mapped[Decimal | None] = mapped_column(
        Numeric(18, 2),
        nullable=True,
    )

    status: Mapped[AuctionItemStatus] = mapped_column(
        Enum(
            AuctionItemStatus,
            name="auction_item_status",
        ),
        nullable=False,
        default=AuctionItemStatus.DRAFT,
        server_default=AuctionItemStatus.DRAFT.value,
    )

    winner_user_id: Mapped[uuid.UUID | None] = mapped_column(
        BinaryUUID(),
        ForeignKey(
            "users.id",
            ondelete="RESTRICT",
            onupdate="CASCADE",
        ),
        nullable=True,
    )

    final_price: Mapped[Decimal | None] = mapped_column(
        Numeric(18, 2),
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
        back_populates="items",
    )

    category = relationship(
        "Category",
        back_populates="auction_items",
    )

    winner = relationship(
        "User",
        back_populates="won_items",
        foreign_keys=[winner_user_id],
    )

    images = relationship(
        "ItemImage",
        back_populates="item",
        cascade="all, delete-orphan",
    )

    bids = relationship(
        "Bid",
        back_populates="item",
    )