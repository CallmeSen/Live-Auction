import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_admin_user, security
from app.models.user_model import User
from common.enum import AuctionSessionStatus, UserRole, UserStatus
from modules.admin.admin_schema import (
    CreateAdminUserData,
    CreateAdminUserRequest,
    CreateAdminUserResponse,
    ResetAdminPasswordData,
    ResetAdminPasswordRequest,
    ResetAdminPasswordResponse,
)
from modules.admin.admin_service import AdminService
from modules.auction_sessions.session_repository import (
    AuctionSessionRepository,
    SessionListFilters,
)
from modules.auction_sessions.session_schema import (
    ApproveAuctionSessionResponse,
    CancelAuctionSessionRequest,
    CancelAuctionSessionResponse,
    ListAuctionSessionsResponse,
    RejectAuctionSessionRequest,
    RejectAuctionSessionResponse,
)
from modules.auction_sessions.session_service import AuctionSessionService
from modules.notifications.notification_repository import NotificationRepository
from modules.notifications.notification_service import NotificationService
from modules.users.notification_preference_repository import (
    NotificationPreferenceRepository,
)
from modules.users.user_repository import UserListFilters, UserRepository
from modules.users.user_schema import (
    ListAdminUsersResponse,
    SortOrder,
    UpdateUserStatusData,
    UpdateUserStatusRequest,
    UpdateUserStatusResponse,
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


def get_auction_session_service() -> AuctionSessionService:
    return AuctionSessionService(
        session_repository=AuctionSessionRepository(),
        notification_service=NotificationService(
            notification_repository=NotificationRepository(),
            notification_preference_repository=NotificationPreferenceRepository(),
        ),
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

AuctionSessionServiceDependency = Annotated[
    AuctionSessionService,
    Depends(get_auction_session_service),
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


@router.patch(
    "/users/{user_id}/status",
    status_code=status.HTTP_200_OK,
    response_model=UpdateUserStatusResponse,
)
async def update_user_status(
    user_id: uuid.UUID,
    request: UpdateUserStatusRequest,
    db: DatabaseSession,
    current_admin: CurrentAdminUser,
    admin_service: AdminServiceDependency,
) -> UpdateUserStatusResponse:
    updated_user = await admin_service.update_user_status(
        db=db,
        user_id=user_id,
        new_status=request.status,
        current_admin=current_admin,
    )

    return UpdateUserStatusResponse(
        status=status.HTTP_200_OK,
        code="USER_STATUS_UPDATED",
        message=f"User status updated to {updated_user.status.value} successfully",
        data=UpdateUserStatusData.model_validate(updated_user),
    )


@router.post(
    "/users",
    status_code=status.HTTP_201_CREATED,
    response_model=CreateAdminUserResponse,
)
async def create_admin_user(
    request: CreateAdminUserRequest,
    db: DatabaseSession,
    current_admin: CurrentAdminUser,
    admin_service: AdminServiceDependency,
) -> CreateAdminUserResponse:
    user = await admin_service.create_admin_user(
        db=db,
        request=request,
        current_admin=current_admin,
    )

    return CreateAdminUserResponse(
        status=status.HTTP_201_CREATED,
        code="ADMIN_USER_CREATED",
        message="Admin user created successfully",
        data=CreateAdminUserData.model_validate(user),
    )


@router.patch(
    "/users/{user_id}/password",
    status_code=status.HTTP_200_OK,
    response_model=ResetAdminPasswordResponse,
)
async def reset_admin_password(
    user_id: uuid.UUID,
    request: ResetAdminPasswordRequest,
    db: DatabaseSession,
    current_admin: CurrentAdminUser,
    admin_service: AdminServiceDependency,
) -> ResetAdminPasswordResponse:
    user = await admin_service.reset_admin_password(
        db=db,
        user_id=user_id,
        new_password=request.new_password,
        current_admin=current_admin,
    )
    return ResetAdminPasswordResponse(
        status=status.HTTP_200_OK,
        code="ADMIN_PASSWORD_RESET",
        message="Administrator password reset successfully",
        data=ResetAdminPasswordData.model_validate(user),
    )


@router.get(
    "/auction-sessions",
    status_code=status.HTTP_200_OK,
    response_model=ListAuctionSessionsResponse,
)
async def list_admin_auction_sessions(
    db: DatabaseSession,
    _current_admin: CurrentAdminUser,
    session_service: AuctionSessionServiceDependency,
    page: Annotated[int, Query(ge=1)] = 1,
    size: Annotated[int, Query(ge=1, le=100)] = 10,
    status_filter: Annotated[
        AuctionSessionStatus | None,
        Query(alias="status"),
    ] = None,
    keyword: Annotated[str | None, Query(max_length=255)] = None,
    category_id: Annotated[
        uuid.UUID | None,
        Query(alias="categoryId"),
    ] = None,
) -> ListAuctionSessionsResponse:
    normalized_keyword = keyword.strip() if keyword else None

    if normalized_keyword == "":
        normalized_keyword = None

    data = await session_service.list_sessions(
        db=db,
        filters=SessionListFilters(
            page=page,
            size=size,
            status=status_filter,
            keyword=normalized_keyword,
            category_id=category_id,
        ),
    )

    return ListAuctionSessionsResponse(
        status=status.HTTP_200_OK,
        code=1000,
        message="Get admin auction sessions successfully",
        data=data,
    )


@router.get(
    "/auction-sessions/pending",
    status_code=status.HTTP_200_OK,
    response_model=ListAuctionSessionsResponse,
)
async def list_pending_auction_sessions(
    db: DatabaseSession,
    _current_admin: CurrentAdminUser,
    session_service: AuctionSessionServiceDependency,
    page: Annotated[int, Query(ge=1)] = 1,
    size: Annotated[int, Query(ge=1, le=100)] = 10,
    keyword: Annotated[str | None, Query(max_length=255)] = None,
    category_id: Annotated[
        uuid.UUID | None,
        Query(alias="categoryId"),
    ] = None,
) -> ListAuctionSessionsResponse:
    normalized_keyword = keyword.strip() if keyword else None

    if normalized_keyword == "":
        normalized_keyword = None

    data = await session_service.list_sessions(
        db=db,
        filters=SessionListFilters(
            page=page,
            size=size,
            status=AuctionSessionStatus.PENDING_APPROVAL,
            keyword=normalized_keyword,
            category_id=category_id,
        ),
    )

    return ListAuctionSessionsResponse(
        status=status.HTTP_200_OK,
        code=1000,
        message="Get pending auction sessions successfully",
        data=data,
    )


@router.patch(
    "/auction-sessions/{session_id}/approve",
    status_code=status.HTTP_200_OK,
    response_model=ApproveAuctionSessionResponse,
)
async def approve_auction_session(
    session_id: uuid.UUID,
    db: DatabaseSession,
    _current_admin: CurrentAdminUser,
    session_service: AuctionSessionServiceDependency,
) -> ApproveAuctionSessionResponse:
    data = await session_service.approve_session(
        db=db,
        session_id=session_id,
    )

    return ApproveAuctionSessionResponse(
        status=status.HTTP_200_OK,
        code="SESSION_APPROVED",
        message="Auction session approved successfully",
        data=data,
    )


@router.patch(
    "/auction-sessions/{session_id}/reject",
    status_code=status.HTTP_200_OK,
    response_model=RejectAuctionSessionResponse,
)
async def reject_auction_session(
    session_id: uuid.UUID,
    request: RejectAuctionSessionRequest,
    db: DatabaseSession,
    _current_admin: CurrentAdminUser,
    session_service: AuctionSessionServiceDependency,
) -> RejectAuctionSessionResponse:
    data = await session_service.reject_session(
        db=db,
        session_id=session_id,
        reason=request.reason,
    )

    return RejectAuctionSessionResponse(
        status=status.HTTP_200_OK,
        code="SESSION_REJECTED",
        message="Auction session rejected successfully",
        data=data,
    )


@router.patch(
    "/auction-sessions/{session_id}/cancel",
    status_code=status.HTTP_200_OK,
    response_model=CancelAuctionSessionResponse,
)
async def cancel_auction_session(
    session_id: uuid.UUID,
    request: CancelAuctionSessionRequest,
    db: DatabaseSession,
    _current_admin: CurrentAdminUser,
    session_service: AuctionSessionServiceDependency,
) -> CancelAuctionSessionResponse:
    data = await session_service.cancel_session(
        db=db,
        session_id=session_id,
        reason=request.reason,
    )

    return CancelAuctionSessionResponse(
        status=status.HTTP_200_OK,
        code="SESSION_CANCELLED",
        message="Auction session cancelled successfully",
        data=data,
    )
