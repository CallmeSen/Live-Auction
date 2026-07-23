from datetime import datetime, timedelta

from fastapi import BackgroundTasks, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import AppException
from app.core.security import create_access_token, hash_password, verify_password
from app.models.user_model import User
from app.utils.email import send_password_reset_email
from common.enum import UserRole, UserStatus
from modules.auth.auth_schema import (
    LoginData,
    LoginRequest,
    LoginUserResponse,
    RegisterRequest,
    RegisterResponse,
)
from modules.auth.password_reset_repository import (
    PasswordResetTokenRepository,
    generate_raw_token,
)
from modules.users.user_repository import UserRepository


class AuthService:
    def __init__(
        self,
        user_repository: UserRepository,
        password_reset_token_repository: PasswordResetTokenRepository | None = None,
    ) -> None:
        self.user_repository = user_repository
        self.password_reset_token_repository = (
            password_reset_token_repository or PasswordResetTokenRepository()
        )

    async def register(
        self,
        db: AsyncSession,
        request: RegisterRequest,
    ) -> User:
        existing_user = await self.user_repository.find_by_email(
            db=db,
            email=str(request.email),
        )

        if existing_user is not None:
            raise AppException(
                status_code=400,
                code="EMAIL_ALREADY_EXISTS",
                message="Email already exists",
            )

        password_hash = hash_password(request.password)

        user = User(
            email=str(request.email),
            password_hash=password_hash,
            full_name=request.full_name,
            phone=request.phone,
            role=UserRole.USER,
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
                status_code=400,
                code="EMAIL_ALREADY_EXISTS",
                message="Email already exists",
            ) from exception

        except Exception:
            await db.rollback()

    async def login(
        self,
        db: AsyncSession,
        request: LoginRequest,
    ) -> LoginData:
        normalized_email = request.email.lower().strip()

        user = await self.user_repository.find_by_email(
            db=db,
            email=normalized_email,
        )

        if user is None:
            raise AppException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                code="INVALID_CREDENTIALS",
                message="Email or password is incorrect",
            )

        password_is_correct = verify_password(
            plain_password=request.password,
            hashed_password=user.password_hash,
        )

        if not password_is_correct:
            raise AppException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                code="INVALID_CREDENTIALS",
                message="Email or password is incorrect",
            )

        if user.status == UserStatus.BANNED:
            raise AppException(
                status_code=status.HTTP_403_FORBIDDEN,
                code="USER_BANNED",
                message="User account is banned",
            )

        access_token = create_access_token(
            subject=str(user.id),
            additional_claims={
                "email": user.email,
                "role": user.role.value,
            },
        )

        return LoginData(
            access_token=access_token,
            token_type="Bearer",
            user=LoginUserResponse(
                id=user.id,
                email=user.email,
                full_name=user.full_name,
                role=user.role,
                status=user.status,
            ),
        )

    async def forgot_password(
        self,
        db: AsyncSession,
        email: str,
        background_tasks: BackgroundTasks,
    ) -> None:
        normalized_email = email.lower().strip()

        user = await self.user_repository.find_by_email(
            db=db,
            email=normalized_email,
        )

        # Luôn trả về "thành công" dù email tồn tại hay không,
        # để tránh lộ thông tin email nào đã đăng ký (email enumeration).
        if user is None:
            return

        if user.status == UserStatus.BANNED:
            return

        raw_token = generate_raw_token()
        expires_at = datetime.now() + timedelta(
            minutes=settings.password_reset_token_expire_minutes,
        )

        await self.password_reset_token_repository.create(
            db=db,
            user_id=user.id,
            raw_token=raw_token,
            expires_at=expires_at,
        )
        await db.commit()

        reset_link = f"{settings.frontend_reset_password_url}?token={raw_token}"

        background_tasks.add_task(
            send_password_reset_email,
            user.email,
            reset_link,
        )

    async def reset_password(
        self,
        db: AsyncSession,
        token: str,
        new_password: str,
    ) -> None:
        reset_token = await self.password_reset_token_repository.find_valid_by_raw_token(
            db=db,
            raw_token=token,
        )

        if reset_token is None:
            raise AppException(
                status_code=status.HTTP_400_BAD_REQUEST,
                code="INVALID_RESET_TOKEN",
                message="Reset token is invalid",
            )

        if reset_token.used_at is not None:
            raise AppException(
                status_code=status.HTTP_400_BAD_REQUEST,
                code="RESET_TOKEN_ALREADY_USED",
                message="Reset token has already been used",
            )

        if reset_token.expires_at < datetime.now():
            raise AppException(
                status_code=status.HTTP_400_BAD_REQUEST,
                code="RESET_TOKEN_EXPIRED",
                message="Reset token has expired",
            )

        user = await self.user_repository.find_by_id(
            db=db,
            user_id=reset_token.user_id,
        )

        if user is None:
            raise AppException(
                status_code=status.HTTP_404_NOT_FOUND,
                code="USER_NOT_FOUND",
                message="User not found",
            )

        user.password_hash = hash_password(new_password)

        try:
            await self.password_reset_token_repository.mark_as_used(
                db=db,
                reset_token=reset_token,
            )
            await db.commit()

        except Exception:
            await db.rollback()
            raise