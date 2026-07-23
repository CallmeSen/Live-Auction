from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from modules.auth.auth_schema import (
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    LoginResponse,
    RegisterRequest,
    RegisterResponse,
    RegisterUserData,
    ResetPasswordRequest,
    ResetPasswordResponse,
)
from modules.auth.auth_service import AuthService
from modules.auth.password_reset_repository import PasswordResetTokenRepository
from modules.users.user_repository import UserRepository


router = APIRouter(
    prefix="/api/v1/auth",
    tags=["Authentication"],
)


def get_auth_service() -> AuthService:
    return AuthService(
        user_repository=UserRepository(),
        password_reset_token_repository=PasswordResetTokenRepository(),
    )


DatabaseSession = Annotated[
    AsyncSession,
    Depends(get_db),
]

AuthServiceDependency = Annotated[
    AuthService,
    Depends(get_auth_service),
]


@router.post(
    "/register",
    status_code=status.HTTP_201_CREATED,
    response_model=RegisterResponse,
)
async def register(
    request: RegisterRequest,
    db: DatabaseSession,
    auth_service: AuthServiceDependency,
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


@router.post(
    "/login",
    response_model=LoginResponse,
    status_code=status.HTTP_200_OK,
)
async def login(
    request: LoginRequest,
    db: DatabaseSession,
    auth_service: AuthServiceDependency,
) -> LoginResponse:
    login_data = await auth_service.login(
        db=db,
        request=request,
    )

    return LoginResponse(
        status=status.HTTP_200_OK,
        code=1000,
        message="Login successfully",
        data=login_data,
    )


@router.post(
    "/forgot-password",
    status_code=status.HTTP_200_OK,
    response_model=ForgotPasswordResponse,
)
async def forgot_password(
    request: ForgotPasswordRequest,
    db: DatabaseSession,
    background_tasks: BackgroundTasks,
    auth_service: AuthServiceDependency,
) -> ForgotPasswordResponse:
    await auth_service.forgot_password(
        db=db,
        email=request.email,
        background_tasks=background_tasks,
    )

    return ForgotPasswordResponse(
        status=status.HTTP_200_OK,
        code="PASSWORD_RESET_EMAIL_SENT",
        message="If the email exists, password reset instructions have been sent",
        data=None,
    )


@router.post(
    "/reset-password",
    status_code=status.HTTP_200_OK,
    response_model=ResetPasswordResponse,
)
async def reset_password(
    request: ResetPasswordRequest,
    db: DatabaseSession,
    auth_service: AuthServiceDependency,
) -> ResetPasswordResponse:
    await auth_service.reset_password(
        db=db,
        token=request.token,
        new_password=request.new_password,
    )

    return ResetPasswordResponse(
        status=status.HTTP_200_OK,
        code="PASSWORD_RESET_SUCCESS",
        message="Password has been reset successfully",
        data=None,
    )