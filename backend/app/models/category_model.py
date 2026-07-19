from typing import TYPE_CHECKING

from sqlalchemy import String, text
from sqlalchemy.dialects.mysql import ENUM
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, CreatedAtMixin, UUIDPrimaryKeyMixin
from app.models.enums import CategoryStatus

if TYPE_CHECKING:
    from app.models.item_model import AuctionItem


class Category(
    UUIDPrimaryKeyMixin,
    CreatedAtMixin,
    Base,
):
    __tablename__ = "categories"

    name: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
    )

    slug: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
        unique=True,
        index=True,
    )

    status: Mapped[CategoryStatus] = mapped_column(
        ENUM(
            CategoryStatus,
            name="category_status",
            values_callable=lambda enum: [item.value for item in enum],
        ),
        nullable=False,
        default=CategoryStatus.ACTIVE,
        server_default=text("'ACTIVE'"),
    )

    auction_items: Mapped[list["AuctionItem"]] = relationship(
        back_populates="category",
    )