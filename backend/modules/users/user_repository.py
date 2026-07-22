import uuid
from dataclasses import dataclass

from sqlalchemy import asc, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user_model import User
from common.enum import UserRole, UserStatus
from modules.users.user_schema import SortOrder, UserSortBy


@dataclass(frozen=True)
class UserListFilters:
    page: int
    page_size: int
    keyword: str | None
    role: UserRole | None
    status: UserStatus | None
    sort_by: UserSortBy
    sort_order: SortOrder


SORT_COLUMN_MAP = {
    UserSortBy.CREATED_AT: User.created_at,
    UserSortBy.EMAIL: User.email,
    UserSortBy.FULL_NAME: User.full_name,
}


class UserRepository:
    def _build_list_conditions(
        self,
        filters: UserListFilters,
    ) -> list:
        conditions = []

        if filters.role is not None:
            conditions.append(User.role == filters.role)

        if filters.status is not None:
            conditions.append(User.status == filters.status)

        if filters.keyword:
            keyword_pattern = f"%{filters.keyword.lower()}%"
            phone_pattern = f"%{filters.keyword}%"
            conditions.append(
                or_(
                    func.lower(User.email).like(keyword_pattern),
                    func.lower(User.full_name).like(keyword_pattern),
                    User.phone.like(phone_pattern),
                ),
            )

        return conditions

    async def list_users(
        self,
        db: AsyncSession,
        filters: UserListFilters,
    ) -> tuple[list[User], int]:
        conditions = self._build_list_conditions(filters)
        offset = (filters.page - 1) * filters.page_size

        count_statement = select(func.count()).select_from(User)
        if conditions:
            count_statement = count_statement.where(*conditions)

        total_result = await db.execute(count_statement)
        total_items = int(total_result.scalar_one())

        sort_column = SORT_COLUMN_MAP[filters.sort_by]
        order_expression = (
            asc(sort_column)
            if filters.sort_order == SortOrder.ASC
            else desc(sort_column)
        )

        list_statement = (
            select(User)
            .order_by(order_expression)
            .offset(offset)
            .limit(filters.page_size)
        )

        if conditions:
            list_statement = list_statement.where(*conditions)

        result = await db.execute(list_statement)

        return list(result.scalars().all()), total_items

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

    async def update(
        self,
        db: AsyncSession,
        user: User,
    ) -> User:
        await db.flush()
        await db.refresh(user)

        return user