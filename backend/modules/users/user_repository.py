import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user_model import User


class UserRepository:
    async def find_by_id(
        self,
        db: AsyncSession,
        user_id: uuid.UUID,
    ) -> User | None:
        statement = select(User).where(User.id == user_id)

        result = await db.execute(statement)

        return result.scalar_one_or_none()

    async def find_by_email(
        self,
        db: AsyncSession,
        email: str,
    ) -> User | None:
        normalized_email = email.lower()

        statement = select(User).where(
            func.lower(User.email) == normalized_email,
        )

        result = await db.execute(statement)

        return result.scalar_one_or_none()

    async def create(
        self,
        db: AsyncSession,
        user: User,
    ) -> User:
        db.add(user)

        # Sends INSERT to database without ending the transaction.
        await db.flush()

        # Reload database-generated values such as timestamps.
        await db.refresh(user)

        return user