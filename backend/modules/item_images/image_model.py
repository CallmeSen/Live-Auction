import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from common.uuid_type import BinaryUUID


class ItemImage(Base):
    __tablename__ = "item_images"

    __table_args__ = (
        UniqueConstraint(
            "item_id",
            "sort_order",
            name="uk_item_images_sort_order",
        ),
        CheckConstraint(
            "sort_order >= 0",
            name="chk_item_images_sort_order",
        ),
        Index(
            "idx_item_images_item_id",
            "item_id",
        ),
        Index(
            "idx_item_images_primary",
            "item_id",
            "is_primary",
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
            ondelete="CASCADE",
            onupdate="CASCADE",
        ),
        nullable=False,
    )

    image_url: Mapped[str] = mapped_column(
        String(500),
        nullable=False,
    )

    is_primary: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default="0",
    )

    sort_order: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
    )

    item = relationship(
        "AuctionItem",
        back_populates="images",
    )