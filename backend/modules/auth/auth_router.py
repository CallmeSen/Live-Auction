from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from modules.auth.auth_schema import (
    RegisterRequest,
    RegisterResponse,
    RegisterUserData,
)
from modules.auth.auth_service import AuthService
from app.core.database import get_db
from modules.users.user_repository import UserRepository


router = APIRouter(
    prefix="/api/v1/auth",
    tags=["Authentication"],
)


def get_auth_service() -> AuthService:
    return AuthService(
        user_repository=UserRepository(),
    )


@router.post(
    "/register",
    status_code=status.HTTP_201_CREATED,
    response_model=RegisterResponse,
)
async def register(
    request: RegisterRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> RegisterResponse:
    user = await auth_service.register(
        db=db,
        request=request,
    )

    return RegisterResponse(
        status=status.HTTP_201_CREATED,
        code=1000,
        message="Register successfully",
        data=RegisterUserData.model_validate(user),
    )