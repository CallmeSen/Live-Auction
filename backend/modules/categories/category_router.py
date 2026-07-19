from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_admin_user, security
from app.models.user_model import User
from modules.categories.category_repository import CategoryRepository
from modules.categories.category_schema import (
    CreateCategoryData,
    CreateCategoryRequest,
    CreateCategoryResponse,
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
