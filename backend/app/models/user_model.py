from typing import TYPE_CHECKING

from sqlalchemy import String, text
from sqlalchemy.dialects.mysql import ENUM
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import UserRole, UserStatus

if TYPE_CHECKING:
    from app.models.item_model import AuctionItem
    from app.models.session_model import AuctionSession
    from app.models.bid_model import Bid


class User(
    UUIDPrimaryKeyMixin,
    TimestampMixin,
    Base,
):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        unique=True,
        index=True,
    )

    password_hash: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    full_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        server_default=text("'user'"),
    )

    phone: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
    )

    role: Mapped[UserRole] = mapped_column(
        ENUM(
            UserRole,
            name="user_role",
            values_callable=lambda enum: [item.value for item in enum],
        ),
        nullable=False,
        default=UserRole.USER,
        server_default=text("'USER'"),
    )

    status: Mapped[UserStatus] = mapped_column(
        ENUM(
            UserStatus,
            name="user_status",
            values_callable=lambda enum: [item.value for item in enum],
        ),
        nullable=False,
        default=UserStatus.ACTIVE,
        server_default=text("'ACTIVE'"),
    )

    auction_sessions: Mapped[list["AuctionSession"]] = relationship(
        back_populates="seller",
        foreign_keys="AuctionSession.seller_id",
    )

    selling_items: Mapped[list["AuctionItem"]] = relationship(
        back_populates="seller",
        foreign_keys="AuctionItem.seller_id",
    )

    won_items: Mapped[list["AuctionItem"]] = relationship(
        back_populates="winner",
        foreign_keys="AuctionItem.winner_user_id",
    )

    bids: Mapped[list["Bid"]] = relationship(
        back_populates="bidder",
        foreign_keys="Bid.bidder_id",
    )