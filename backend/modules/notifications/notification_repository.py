import uuid
from dataclasses import dataclass

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification_model import Notification


@dataclass(frozen=True)
class NotificationListFilters:
    page: int
    size: int
    unread_only: bool


class NotificationRepository:
    async def list_notifications(
        self,
        db: AsyncSession,
        user_id: uuid.UUID,
        filters: NotificationListFilters,
    ) -> tuple[list[Notification], int]:
        conditions = [Notification.user_id == user_id]

        if filters.unread_only:
            conditions.append(Notification.is_read.is_(False))

        offset = (filters.page - 1) * filters.size

        count_statement = (
            select(func.count())
            .select_from(Notification)
            .where(*conditions)
        )
        total_result = await db.execute(count_statement)
        total = total_result.scalar_one()

        list_statement = (
            select(Notification)
            .where(*conditions)
            .order_by(Notification.created_at.desc())
            .offset(offset)
            .limit(filters.size)
        )
        result = await db.execute(list_statement)

        return list(result.scalars().all()), total

    async def count_unread(
        self,
        db: AsyncSession,
        user_id: uuid.UUID,
    ) -> int:
        statement = (
            select(func.count())
            .select_from(Notification)
            .where(
                Notification.user_id == user_id,
                Notification.is_read.is_(False),
            )
        )
        result = await db.execute(statement)

        return result.scalar_one()

    async def find_by_id_for_user(
        self,
        db: AsyncSession,
        notification_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> Notification | None:
        statement = select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == user_id,
        )
        result = await db.execute(statement)

        return result.scalar_one_or_none()

    async def mark_as_read(
        self,
        db: AsyncSession,
        notification: Notification,
    ) -> Notification:
        notification.is_read = True

        await db.flush()
        await db.refresh(notification)

        return notification

    async def mark_all_as_read(
        self,
        db: AsyncSession,
        user_id: uuid.UUID,
    ) -> int:
        statement = (
            update(Notification)
            .where(
                Notification.user_id == user_id,
                Notification.is_read.is_(False),
            )
            .values(is_read=True)
        )
        result = await db.execute(statement)

        return result.rowcount

    async def create(
        self,
        db: AsyncSession,
        notification: Notification,
    ) -> Notification:
        db.add(notification)

        await db.flush()
        await db.refresh(notification)

        return notification