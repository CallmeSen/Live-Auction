import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.user_model import User


class NotificationPreference(
    UUIDPrimaryKeyMixin,
    TimestampMixin,
    Base,
):
    __tablename__ = "notification_preferences"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    notify_when_outbid: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
    )

    remind_before_auction_ends: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
    )

    receive_featured_auction_news: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
    )

    user: Mapped["User"] = relationship()