import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.category_model import Category


class CategoryRepository:
    async def find_by_id(
        self,
        db: AsyncSession,
        category_id: uuid.UUID,
    ) -> Category | None:
        statement = select(Category).where(
            Category.id == category_id,
        )

        result = await db.execute(statement)

        return result.scalar_one_or_none()

    async def find_by_name(
        self,
        db: AsyncSession,
        name: str,
    ) -> Category | None:
        statement = select(Category).where(
            func.lower(Category.name) == name.lower(),
        )

        result = await db.execute(statement)

        return result.scalar_one_or_none()

    async def find_by_slug(
        self,
        db: AsyncSession,
        slug: str,
    ) -> Category | None:
        statement = select(Category).where(
            Category.slug == slug,
        )

        result = await db.execute(statement)

        return result.scalar_one_or_none()

    async def create(
        self,
        db: AsyncSession,
        category: Category,
    ) -> Category:
        db.add(category)

        await db.flush()
        await db.refresh(category)

        return category
