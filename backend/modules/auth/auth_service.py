from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import status

from modules.auth.auth_schema import LoginUserResponse, RegisterRequest, RegisterResponse, LoginRequest, LoginData
from app.core.security import create_access_token, verify_password
from common.enum import UserRole, UserStatus
from app.core.exceptions import AppException
from app.core.security import hash_password
from modules.users.user_model import User
from modules.users.user_repository import UserRepository


class AuthService:
    def __init__(
        self,
        user_repository: UserRepository,
    ) -> None:
        self.user_repository = user_repository

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