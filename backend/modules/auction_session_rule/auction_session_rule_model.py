import uuid
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import DECIMAL, ForeignKey, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.database.types import UUIDBinary

if TYPE_CHECKING:
    from app.models.auction_session import AuctionSession


class AuctionSessionRule(
    UUIDPrimaryKeyMixin,
    TimestampMixin,
    Base,
):
    __tablename__ = "auction_session_rules"

    session_id: Mapped[uuid.UUID] = mapped_column(
        UUIDBinary(),
        ForeignKey(
            "auction_sessions.id",
            ondelete="CASCADE",
            name="fk_auction_session_rules_session",
        ),
        nullable=False,
        unique=True,
    )

    min_increment: Mapped[Decimal] = mapped_column(
        DECIMAL(18, 2),
        nullable=False,
        default=Decimal("1.00"),
        server_default=text("1.00"),
    )

    session: Mapped["AuctionSession"] = relationship(
        back_populates="rules",
    )