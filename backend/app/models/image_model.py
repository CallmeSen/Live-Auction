import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Integer, String, UniqueConstraint, false
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, CreatedAtMixin, UUIDPrimaryKeyMixin
from app.database.types import UUIDString

if TYPE_CHECKING:
    from app.models.item_model import AuctionItem


class ItemImage(
    UUIDPrimaryKeyMixin,
    CreatedAtMixin,
    Base,
):
    __tablename__ = "item_images"

    __table_args__ = (
        UniqueConstraint(
            "item_id",
            "sort_order",
            name="uq_item_images_item_sort_order",
        ),
    )

    item_id: Mapped[uuid.UUID] = mapped_column(
        UUIDString(),
        ForeignKey(
            "auction_items.id",
            ondelete="CASCADE",
            name="fk_item_images_item",
        ),
        nullable=False,
        index=True,
    )

    image_url: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
    )

    is_primary: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=false(),
    )

    sort_order: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
    )

    item: Mapped["AuctionItem"] = relationship(
        back_populates="images",
    )