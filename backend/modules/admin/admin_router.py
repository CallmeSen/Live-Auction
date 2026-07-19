from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_admin_user, security
from app.models.user_model import User
from modules.admin.admin_schema import (
    CreateAdminUserData,
    CreateAdminUserRequest,
    CreateAdminUserResponse,
)
from modules.admin.admin_service import AdminService
from modules.users.user_repository import UserRepository


router = APIRouter(
    prefix="/api/v1/admin",
    tags=["Admin"],
    dependencies=[Depends(security)],
)


def get_admin_service() -> AdminService:
    return AdminService(
        user_repository=UserRepository(),
    )


DatabaseSession = Annotated[
    AsyncSession,
    Depends(get_db),
]

AdminServiceDependency = Annotated[
    AdminService,
    Depends(get_admin_service),
]

CurrentAdminUser = Annotated[
    User,
    Depends(get_current_admin_user),
]


@router.post(
    "/users",
    status_code=status.HTTP_201_CREATED,
    response_model=CreateAdminUserResponse,
)
async def create_admin_user(
    request: CreateAdminUserRequest,
    db: DatabaseSession,
    _current_admin: CurrentAdminUser,
    admin_service: AdminServiceDependency,
) -> CreateAdminUserResponse:
    user = await admin_service.create_admin_user(
        db=db,
        request=request,
    )

    return CreateAdminUserResponse(
        status=status.HTTP_201_CREATED,
        code="ADMIN_USER_CREATED",
        message="Admin user created successfully",
        data=CreateAdminUserData.model_validate(user),
    )
