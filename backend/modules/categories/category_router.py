import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_admin_user, security
from app.models.user_model import User
from common.enum import CategoryStatus
from modules.categories.category_repository import (
    CategoryListFilters,
    CategoryRepository,
)
from modules.categories.category_schema import (
    CategoryDetailData,
    CreateCategoryData,
    CreateCategoryRequest,
    CreateCategoryResponse,
    DeleteCategoryResponse,
    GetCategoryDetailResponse,
    ListCategoriesResponse,
    UpdateCategoryData,
    UpdateCategoryRequest,
    UpdateCategoryResponse,
)
from modules.categories.category_service import CategoryService


router = APIRouter(
    prefix="/api/v1/categories",
    tags=["Categories"],
    dependencies=[Depends(security)],
)


def get_category_service() -> CategoryService:
    return CategoryService(
        category_repository=CategoryRepository(),
    )


DatabaseSession = Annotated[
    AsyncSession,
    Depends(get_db),
]

CategoryServiceDependency = Annotated[
    CategoryService,
    Depends(get_category_service),
]

CurrentAdminUser = Annotated[
    User,
    Depends(get_current_admin_user),
]


@router.get(
    "",
    status_code=status.HTTP_200_OK,
    response_model=ListCategoriesResponse,
)
async def list_categories(
    db: DatabaseSession,
    category_service: CategoryServiceDependency,
    page: Annotated[int, Query(ge=1)] = 1,
    size: Annotated[int, Query(ge=1, le=100)] = 10,
    status_filter: Annotated[
        CategoryStatus | None,
        Query(alias="status"),
    ] = None,
    keyword: Annotated[str | None, Query(max_length=150)] = None,
) -> ListCategoriesResponse:
    normalized_keyword = keyword.strip() if keyword else None

    if normalized_keyword == "":
        normalized_keyword = None

    data = await category_service.list_categories(
        db=db,
        filters=CategoryListFilters(
            page=page,
            size=size,
            status=status_filter,
            keyword=normalized_keyword,
        ),
    )

    return ListCategoriesResponse(
        status=status.HTTP_200_OK,
        code=1000,
        message="Get categories successfully",
        data=data,
    )


@router.get(
    "/{category_id}",
    status_code=status.HTTP_200_OK,
    response_model=GetCategoryDetailResponse,
)
async def get_category_detail(
    category_id: uuid.UUID,
    db: DatabaseSession,
    category_service: CategoryServiceDependency,
) -> GetCategoryDetailResponse:
    category = await category_service.get_category_detail(
        db=db,
        category_id=category_id,
    )

    return GetCategoryDetailResponse(
        status=status.HTTP_200_OK,
        code=1000,
        message="Get category detail successfully",
        data=CategoryDetailData.model_validate(category),
    )


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=CreateCategoryResponse,
)
async def create_category(
    request: CreateCategoryRequest,
    db: DatabaseSession,
    _current_admin: CurrentAdminUser,
    category_service: CategoryServiceDependency,
) -> CreateCategoryResponse:
    category = await category_service.create_category(
        db=db,
        request=request,
    )

    return CreateCategoryResponse(
        status=status.HTTP_201_CREATED,
        code=1000,
        message="Category created successfully",
        data=CreateCategoryData.model_validate(category),
    )


@router.patch(
    "/{category_id}",
    status_code=status.HTTP_200_OK,
    response_model=UpdateCategoryResponse,
)
async def update_category(
    category_id: uuid.UUID,
    request: UpdateCategoryRequest,
    db: DatabaseSession,
    _current_admin: CurrentAdminUser,
    category_service: CategoryServiceDependency,
) -> UpdateCategoryResponse:
    category = await category_service.update_category(
        db=db,
        category_id=category_id,
        request=request,
    )

    return UpdateCategoryResponse(
        status=status.HTTP_200_OK,
        code=1000,
        message="Category updated successfully",
        data=UpdateCategoryData.model_validate(category),
    )


@router.delete(
    "/{category_id}",
    status_code=status.HTTP_200_OK,
    response_model=DeleteCategoryResponse,
)
async def delete_category(
    category_id: uuid.UUID,
    db: DatabaseSession,
    _current_admin: CurrentAdminUser,
    category_service: CategoryServiceDependency,
) -> DeleteCategoryResponse:
    await category_service.delete_category(
        db=db,
        category_id=category_id,
    )

    return DeleteCategoryResponse(
        status=status.HTTP_200_OK,
        code=1000,
        message="Category deactivated successfully",
        data=None,
    )