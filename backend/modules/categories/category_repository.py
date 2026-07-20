import uuid
from dataclasses import dataclass

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.category_model import Category
from common.enum import CategoryStatus


@dataclass(frozen=True)
class CategoryListFilters:
    page: int
    size: int
    status: CategoryStatus | None
    keyword: str | None


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
        exclude_id: uuid.UUID | None = None,
    ) -> Category | None:
        statement = select(Category).where(
            func.lower(Category.name) == name.lower(),
        )

        if exclude_id is not None:
            statement = statement.where(Category.id != exclude_id)

        result = await db.execute(statement)

        return result.scalar_one_or_none()

    async def find_by_slug(
        self,
        db: AsyncSession,
        slug: str,
        exclude_id: uuid.UUID | None = None,
    ) -> Category | None:
        statement = select(Category).where(
            Category.slug == slug,
        )

        if exclude_id is not None:
            statement = statement.where(Category.id != exclude_id)

        result = await db.execute(statement)

        return result.scalar_one_or_none()

    def _build_list_conditions(
        self,
        filters: CategoryListFilters,
    ) -> list:
        conditions = []

        if filters.status is not None:
            conditions.append(Category.status == filters.status)

        if filters.keyword:
            keyword_pattern = f"%{filters.keyword.lower()}%"
            conditions.append(
                func.lower(Category.name).like(keyword_pattern),
            )

        return conditions

    async def list_categories(
        self,
        db: AsyncSession,
        filters: CategoryListFilters,
    ) -> tuple[list[Category], int]:
        conditions = self._build_list_conditions(filters)
        offset = (filters.page - 1) * filters.size

        count_statement = select(func.count()).select_from(Category)

        if conditions:
            count_statement = count_statement.where(*conditions)

        total_result = await db.execute(count_statement)
        total = total_result.scalar_one()

        statement = (
            select(Category)
            .order_by(Category.created_at.desc())
            .offset(offset)
            .limit(filters.size)
        )

        if conditions:
            statement = statement.where(*conditions)

        result = await db.execute(statement)

        return list(result.scalars().unique().all()), total

    async def create(
        self,
        db: AsyncSession,
        category: Category,
    ) -> Category:
        db.add(category)

        await db.flush()
        await db.refresh(category)

        return category

    async def update(
        self,
        db: AsyncSession,
        category: Category,
    ) -> Category:
        await db.flush()
        await db.refresh(category)

        return category