import uuid
from typing import Annotated

from fastapi import Depends, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import AppException
from app.core.security import decode_access_token
from app.models.user_model import User
from common.enum import UserRole, UserStatus
from modules.users.user_repository import UserRepository


security = HTTPBearer(
    scheme_name="BearerAuth",
    description="JWT access token from POST /api/v1/auth/login",
    auto_error=False,
)


async def get_current_user_id(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None,
        Depends(security),
    ],
) -> uuid.UUID:
    if credentials is None:
        raise AppException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            code="UNAUTHORIZED",
            message="Authentication is required",
        )

    payload = decode_access_token(credentials.credentials)

    subject = payload.get("sub")

    if not subject:
        raise AppException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            code="INVALID_ACCESS_TOKEN",
            message="Access token is invalid or expired",
        )

    try:
        return uuid.UUID(str(subject))
    except ValueError as exception:
        raise AppException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            code="INVALID_ACCESS_TOKEN",
            message="Access token is invalid or expired",
        ) from exception


async def get_current_admin_user(
    user_id: Annotated[uuid.UUID, Depends(get_current_user_id)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    user = await UserRepository().find_by_id(
        db=db,
        user_id=user_id,
    )

    if user is None:
        raise AppException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            code="USER_NOT_FOUND",
            message="Authenticated user was not found",
        )

    if user.status == UserStatus.BANNED:
        raise AppException(
            status_code=status.HTTP_403_FORBIDDEN,
            code="USER_BANNED",
            message="Your account has been banned",
        )

    if user.role != UserRole.ADMIN:
        raise AppException(
            status_code=status.HTTP_403_FORBIDDEN,
            code="ADMIN_ACCESS_REQUIRED",
            message="Administrator permission is required",
        )

    return user


async def get_current_active_user(
    user_id: Annotated[uuid.UUID, Depends(get_current_user_id)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    user = await UserRepository().find_by_id(
        db=db,
        user_id=user_id,
    )

    if user is None:
        raise AppException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            code="USER_NOT_FOUND",
            message="Authenticated user was not found",
        )

    if user.status == UserStatus.BANNED:
        raise AppException(
            status_code=status.HTTP_403_FORBIDDEN,
            code="USER_BANNED",
            message="Your account has been banned",
        )

    if user.status != UserStatus.ACTIVE:
        raise AppException(
            status_code=status.HTTP_403_FORBIDDEN,
            code="USER_NOT_ACTIVE",
            message="Your account is not active",
        )

    return user
