import math
import uuid

from fastapi import status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppException
from modules.users.user_repository import UserListFilters, UserRepository
from modules.users.user_schema import (
    AdminUserListData,
    AdminUserListItem,
    AdminUserListPagination,
    UpdateProfileRequest,
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

    async def get_profile(
        self,
        db: AsyncSession,
        user_id: uuid.UUID,
    ):
        user = await self.user_repository.find_by_id(
            db=db,
            user_id=user_id,
        )

        if user is None:
            raise AppException(
                status_code=status.HTTP_404_NOT_FOUND,
                code="USER_NOT_FOUND",
                message="User not found",
            )

        return user

    async def update_profile(
        self,
        db: AsyncSession,
        user_id: uuid.UUID,
        request: UpdateProfileRequest,
    ):
        user = await self.user_repository.find_by_id(
            db=db,
            user_id=user_id,
        )

        if user is None:
            raise AppException(
                status_code=status.HTTP_404_NOT_FOUND,
                code="USER_NOT_FOUND",
                message="User not found",
            )

        if request.full_name is not None:
            user.full_name = request.full_name

        if request.phone is not None:
            user.phone = request.phone

        try:
            updated_user = await self.user_repository.update(
                db=db,
                user=user,
            )
            await db.commit()

            return updated_user

        except AppException:
            await db.rollback()
            raise

        except Exception as exception:
            await db.rollback()

            raise AppException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                code="INTERNAL_SERVER_ERROR",
                message="An unexpected error occurred",
            ) from exception