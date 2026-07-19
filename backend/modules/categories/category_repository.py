import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from modules.categories.category_model import Category


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
