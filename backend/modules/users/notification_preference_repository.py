import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification_preference_model import NotificationPreference


class NotificationPreferenceRepository:
    async def find_by_user_id(
        self,
        db: AsyncSession,
        user_id: uuid.UUID,
    ) -> NotificationPreference | None:
        statement = select(NotificationPreference).where(
            NotificationPreference.user_id == user_id,
        )
        result = await db.execute(statement)

        return result.scalar_one_or_none()

    async def create(
        self,
        db: AsyncSession,
        preference: NotificationPreference,
    ) -> NotificationPreference:
        db.add(preference)

        await db.flush()
        await db.refresh(preference)

        return preference

    async def update(
        self,
        db: AsyncSession,
        preference: NotificationPreference,
    ) -> NotificationPreference:
        await db.flush()
        await db.refresh(preference)

        return preference