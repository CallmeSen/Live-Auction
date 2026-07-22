from fastapi import status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppException
from app.core.security import hash_password
from common.enum import UserRole, UserStatus
from app.models.user_model import User
from modules.admin.admin_schema import CreateAdminUserRequest
from modules.users.user_repository import UserRepository


class AdminService:
    def __init__(
        self,
        user_repository: UserRepository,
    ) -> None:
        self.user_repository = user_repository

    async def create_admin_user(
        self,
        db: AsyncSession,
        request: CreateAdminUserRequest,
    ) -> User:
        normalized_email = request.email.lower()

        existing_user = await self.user_repository.find_by_email(
            db=db,
            email=normalized_email,
        )

        if existing_user is not None:
            raise AppException(
                status_code=status.HTTP_400_BAD_REQUEST,
                code="EMAIL_ALREADY_EXISTS",
                message="Email already exists",
            )

        user = User(
            email=normalized_email,
            password_hash=hash_password(request.password),
            full_name=request.full_name,
            phone=request.phone,
            role=UserRole.ADMIN,
            status=UserStatus.ACTIVE,
        )

        try:
            created_user = await self.user_repository.create(
                db=db,
                user=user,
            )
            await db.commit()

            return created_user

        except IntegrityError as exception:
            await db.rollback()

            raise AppException(
                status_code=status.HTTP_400_BAD_REQUEST,
                code="EMAIL_ALREADY_EXISTS",
                message="Email already exists",
            ) from exception

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

    async def update_user_status(
        self,
        db: AsyncSession,
        user_id,
        new_status: UserStatus,
        current_admin: User,
    ) -> User:
        target_user = await self.user_repository.find_by_id(
            db=db,
            user_id=user_id,
        )

        if target_user is None:
            raise AppException(
                status_code=status.HTTP_404_NOT_FOUND,
                code="USER_NOT_FOUND",
                message="User not found",
            )

        if target_user.id == current_admin.id:
            raise AppException(
                status_code=status.HTTP_400_BAD_REQUEST,
                code="CANNOT_UPDATE_OWN_STATUS",
                message="You cannot change your own account status",
            )

        if target_user.status == new_status:
            raise AppException(
                status_code=status.HTTP_409_CONFLICT,
                code="USER_STATUS_UNCHANGED",
                message=f"User is already {new_status.value}",
            )

        target_user.status = new_status

        try:
            updated_user = await self.user_repository.update(
                db=db,
                user=target_user,
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