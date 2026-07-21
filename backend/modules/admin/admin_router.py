from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_admin_user, security
from app.models.user_model import User
from common.enum import UserRole, UserStatus
from modules.admin.admin_schema import (
    CreateAdminUserData,
    CreateAdminUserRequest,
    CreateAdminUserResponse,
)
from modules.admin.admin_service import AdminService
from modules.users.user_repository import UserListFilters, UserRepository
from modules.users.user_schema import (
    ListAdminUsersResponse,
    SortOrder,
    UserSortBy,
)
from modules.users.user_service import UserService


router = APIRouter(
    prefix="/api/v1/admin",
    tags=["Admin"],
    dependencies=[Depends(security)],
)


def get_user_repository() -> UserRepository:
    return UserRepository()


def get_admin_service(
    user_repository: Annotated[
        UserRepository,
        Depends(get_user_repository),
    ],
) -> AdminService:
    return AdminService(
        user_repository=user_repository,
    )


def get_user_service(
    user_repository: Annotated[
        UserRepository,
        Depends(get_user_repository),
    ],
) -> UserService:
    return UserService(
        user_repository=user_repository,
    )


DatabaseSession = Annotated[
    AsyncSession,
    Depends(get_db),
]

AdminServiceDependency = Annotated[
    AdminService,
    Depends(get_admin_service),
]

UserServiceDependency = Annotated[
    UserService,
    Depends(get_user_service),
]

CurrentAdminUser = Annotated[
    User,
    Depends(get_current_admin_user),
]


@router.get(
    "/users",
    status_code=status.HTTP_200_OK,
    response_model=ListAdminUsersResponse,
)
async def list_admin_users(
    db: DatabaseSession,
    _current_admin: CurrentAdminUser,
    user_service: UserServiceDependency,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[
        int,
        Query(alias="pageSize", ge=1, le=100),
    ] = 20,
    keyword: Annotated[str | None, Query(max_length=255)] = None,
    role: Annotated[UserRole | None, Query()] = None,
    status_filter: Annotated[
        UserStatus | None,
        Query(alias="status"),
    ] = None,
    sort_by: Annotated[
        UserSortBy,
        Query(alias="sortBy"),
    ] = UserSortBy.CREATED_AT,
    sort_order: Annotated[
        SortOrder,
        Query(alias="sortOrder"),
    ] = SortOrder.DESC,
) -> ListAdminUsersResponse:
    normalized_keyword = keyword.strip() if keyword else None

    if normalized_keyword == "":
        normalized_keyword = None

    data = await user_service.list_users(
        db=db,
        filters=UserListFilters(
            page=page,
            page_size=page_size,
            keyword=normalized_keyword,
            role=role,
            status=status_filter,
            sort_by=sort_by,
            sort_order=sort_order,
        ),
    )

    return ListAdminUsersResponse(
        status=status.HTTP_200_OK,
        code=1000,
        message="Get user list successfully",
        data=data,
    )


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
