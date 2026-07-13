import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from common.uuid_type import BinaryUUID
from common.enum import CategoryStatus






class Category(Base):
    __tablename__ = "categories"

    id: Mapped[uuid.UUID] = mapped_column(
        BinaryUUID(),
        primary_key=True,
        default=uuid.uuid4,
    )

    name: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
        unique=True,
    )

    slug: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
        unique=True,
        index=True,
    )

    status: Mapped[CategoryStatus] = mapped_column(
        Enum(CategoryStatus, name="category_status"),
        nullable=False,
        default=CategoryStatus.ACTIVE,
        server_default=CategoryStatus.ACTIVE.value,
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

    auction_items = relationship(
        "AuctionItem",
        back_populates="category",
    )