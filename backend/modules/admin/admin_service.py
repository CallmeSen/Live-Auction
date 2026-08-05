import uuid

from fastapi import status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppException
from app.core.security import hash_password
from app.models.user_model import User
from common.enum import UserRole, UserStatus
from modules.admin.admin_schema import CreateAdminUserRequest
from modules.users.user_repository import UserRepository


class AdminService:
    def __init__(self, user_repository: UserRepository) -> None:
        self.user_repository = user_repository

    @staticmethod
    def _require_primary_admin(current_admin: User) -> None:
        if not current_admin.is_primary_admin:
            raise AppException(
                status_code=status.HTTP_403_FORBIDDEN,
                code="PRIMARY_ADMIN_REQUIRED",
                message="Only the primary admin can manage administrator accounts",
            )

    async def create_admin_user(
        self,
        db: AsyncSession,
        request: CreateAdminUserRequest,
        current_admin: User,
    ) -> User:
        self._require_primary_admin(current_admin)
        normalized_email = request.email.lower()
        existing_user = await self.user_repository.find_by_email(db=db, email=normalized_email)
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
            is_primary_admin=False,
        )
        try:
            created_user = await self.user_repository.create(db=db, user=user)
            await db.commit()
            return created_user
        except IntegrityError as exception:
            await db.rollback()
            raise AppException(
                status_code=status.HTTP_400_BAD_REQUEST,
                code="EMAIL_ALREADY_EXISTS",
                message="Email already exists",
            ) from exception
        except Exception:
            await db.rollback()
            raise

    async def reset_admin_password(
        self,
        db: AsyncSession,
        user_id: uuid.UUID,
        new_password: str,
        current_admin: User,
    ) -> User:
        self._require_primary_admin(current_admin)
        target_user = await self.user_repository.find_by_id(db=db, user_id=user_id)
        if target_user is None or target_user.role != UserRole.ADMIN:
            raise AppException(
                status_code=status.HTTP_404_NOT_FOUND,
                code="ADMIN_NOT_FOUND",
                message="Administrator account not found",
            )
        if target_user.is_primary_admin:
            raise AppException(
                status_code=status.HTTP_400_BAD_REQUEST,
                code="CANNOT_RESET_PRIMARY_ADMIN_PASSWORD",
                message="The primary admin password cannot be reset from this screen",
            )
        target_user.password_hash = hash_password(new_password)
        try:
            updated_user = await self.user_repository.update(db=db, user=target_user)
            await db.commit()
            return updated_user
        except Exception:
            await db.rollback()
            raise

    async def update_user_status(
        self,
        db: AsyncSession,
        user_id: uuid.UUID,
        new_status: UserStatus,
        current_admin: User,
    ) -> User:
        target_user = await self.user_repository.find_by_id(db=db, user_id=user_id)
        if target_user is None:
            raise AppException(status_code=404, code="USER_NOT_FOUND", message="User not found")
        if target_user.id == current_admin.id:
            raise AppException(
                status_code=400,
                code="CANNOT_UPDATE_OWN_STATUS",
                message="You cannot change your own account status",
            )
        if target_user.is_primary_admin:
            raise AppException(
                status_code=403,
                code="CANNOT_UPDATE_PRIMARY_ADMIN",
                message="The primary admin account cannot be disabled",
            )
        if target_user.role == UserRole.ADMIN:
            self._require_primary_admin(current_admin)
        if target_user.status == new_status:
            raise AppException(
                status_code=409,
                code="USER_STATUS_UNCHANGED",
                message=f"User is already {new_status.value}",
            )
        target_user.status = new_status
        try:
            updated_user = await self.user_repository.update(db=db, user=target_user)
            await db.commit()
            return updated_user
        except Exception:
            await db.rollback()
            raise
