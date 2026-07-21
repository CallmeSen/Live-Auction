import math

from sqlalchemy.ext.asyncio import AsyncSession

from modules.users.user_repository import UserListFilters, UserRepository
from modules.users.user_schema import (
    AdminUserListData,
    AdminUserListItem,
    AdminUserListPagination,
)


class UserService:
    def __init__(
        self,
        user_repository: UserRepository,
    ) -> None:
        self.user_repository = user_repository

    async def list_users(
        self,
        db: AsyncSession,
        filters: UserListFilters,
    ) -> AdminUserListData:
        users, total_items = await self.user_repository.list_users(
            db=db,
            filters=filters,
        )

        total_pages = (
            math.ceil(total_items / filters.page_size)
            if total_items > 0
            else 0
        )

        return AdminUserListData(
            items=[
                AdminUserListItem.model_validate(user)
                for user in users
            ],
            pagination=AdminUserListPagination(
                page=filters.page,
                page_size=filters.page_size,
                total_items=total_items,
                total_pages=total_pages,
                has_next_page=(
                    total_pages > 0 and filters.page < total_pages
                ),
                has_previous_page=filters.page > 1,
            ),
        )
