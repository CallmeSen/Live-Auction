import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from modules.users.notification_preference_repository import NotificationPreferenceRepository
from app.core.database import get_db
from app.core.dependencies import get_current_user_id, security
from modules.users.user_repository import UserRepository
from modules.users.user_schema import (
    GetNotificationPreferenceResponse,
    GetProfileResponse,
    NotificationPreferenceData,
    UpdateNotificationPreferenceRequest,
    UpdateNotificationPreferenceResponse,
    UpdateProfileData,
    UpdateProfileRequest,
    UpdateProfileResponse,
    UserProfileData,
    GetProfileResponse,
    UpdateProfileData,
    UpdateProfileRequest,
    UpdateProfileResponse,
    UserProfileData,
)
from modules.users.user_service import UserService


router = APIRouter(
    prefix="/api/v1/users",
    tags=["Users"],
    dependencies=[Depends(security)],
)


def get_user_repository() -> UserRepository:
    return UserRepository()


def get_user_service(
    user_repository: Annotated[
        UserRepository,
        Depends(get_user_repository),
    ],
) -> UserService:
    return UserService(
        user_repository=user_repository,
        notification_preference_repository=NotificationPreferenceRepository(),
    )


DatabaseSession = Annotated[
    AsyncSession,
    Depends(get_db),
]

UserServiceDependency = Annotated[
    UserService,
    Depends(get_user_service),
]

CurrentUserId = Annotated[
    uuid.UUID,
    Depends(get_current_user_id),
]


@router.get(
    "/me",
    status_code=status.HTTP_200_OK,
    response_model=GetProfileResponse,
)
async def get_my_profile(
    db: DatabaseSession,
    current_user_id: CurrentUserId,
    user_service: UserServiceDependency,
) -> GetProfileResponse:
    user = await user_service.get_profile(
        db=db,
        user_id=current_user_id,
    )

    return GetProfileResponse(
        status=status.HTTP_200_OK,
        code="PROFILE_FETCHED",
        message="Get profile successfully",
        data=UserProfileData.model_validate(user),
    )


@router.patch(
    "/me",
    status_code=status.HTTP_200_OK,
    response_model=UpdateProfileResponse,
)
async def update_my_profile(
    request: UpdateProfileRequest,
    db: DatabaseSession,
    current_user_id: CurrentUserId,
    user_service: UserServiceDependency,
) -> UpdateProfileResponse:
    updated_user = await user_service.update_profile(
        db=db,
        user_id=current_user_id,
        request=request,
    )

    return UpdateProfileResponse(
        status=status.HTTP_200_OK,
        code="PROFILE_UPDATED",
        message="Update profile successfully",
        data=UpdateProfileData.model_validate(updated_user),
    )
@router.get(
    "/me/notification-preferences",
    status_code=status.HTTP_200_OK,
    response_model=GetNotificationPreferenceResponse,
)
async def get_my_notification_preferences(
    db: DatabaseSession,
    current_user_id: CurrentUserId,
    user_service: UserServiceDependency,
) -> GetNotificationPreferenceResponse:
    preference = await user_service.get_notification_preferences(
        db=db,
        user_id=current_user_id,
    )

    return GetNotificationPreferenceResponse(
        status=status.HTTP_200_OK,
        code="NOTIFICATION_PREFERENCE_FETCHED",
        message="Get notification preferences successfully",
        data=NotificationPreferenceData.model_validate(preference),
    )


@router.patch(
    "/me/notification-preferences",
    status_code=status.HTTP_200_OK,
    response_model=UpdateNotificationPreferenceResponse,
)
async def update_my_notification_preferences(
    request: UpdateNotificationPreferenceRequest,
    db: DatabaseSession,
    current_user_id: CurrentUserId,
    user_service: UserServiceDependency,
) -> UpdateNotificationPreferenceResponse:
    preference = await user_service.update_notification_preferences(
        db=db,
        user_id=current_user_id,
        request=request,
    )

    return UpdateNotificationPreferenceResponse(
        status=status.HTTP_200_OK,
        code="NOTIFICATION_PREFERENCE_UPDATED",
        message="Update notification preferences successfully",
        data=NotificationPreferenceData.model_validate(preference),
    )    