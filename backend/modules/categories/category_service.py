import uuid

from fastapi import status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppException
from app.utils.slug import generate_slug
from common.enum import CategoryStatus
from app.models.category_model import Category
from modules.categories.category_repository import (
    CategoryListFilters,
    CategoryRepository,
)
from modules.categories.category_schema import (
    CategoryListData,
    CategoryListItem,
    CreateCategoryRequest,
    UpdateCategoryRequest,
)


class CategoryService:
    def __init__(
        self,
        category_repository: CategoryRepository,
    ) -> None:
        self.category_repository = category_repository

    async def create_category(
        self,
        db: AsyncSession,
        request: CreateCategoryRequest,
    ) -> Category:
        slug = request.slug or generate_slug(request.name)

        if not slug:
            raise AppException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                code="INVALID_SLUG",
                message="Unable to generate a valid slug from the category name",
            )

        existing_name = await self.category_repository.find_by_name(
            db=db,
            name=request.name,
        )

        if existing_name is not None:
            raise AppException(
                status_code=status.HTTP_409_CONFLICT,
                code="CATEGORY_NAME_ALREADY_EXISTS",
                message="A category with this name already exists",
            )

        existing_slug = await self.category_repository.find_by_slug(
            db=db,
            slug=slug,
        )

        if existing_slug is not None:
            raise AppException(
                status_code=status.HTTP_409_CONFLICT,
                code="CATEGORY_SLUG_ALREADY_EXISTS",
                message="A category with this slug already exists",
            )

        category = Category(
            name=request.name,
            slug=slug,
            status=CategoryStatus.ACTIVE,
        )

        try:
            created_category = await self.category_repository.create(
                db=db,
                category=category,
            )
            await db.commit()

            return created_category

        except IntegrityError as exception:
            await db.rollback()

            error_message = str(exception.orig).lower()

            if "name" in error_message:
                raise AppException(
                    status_code=status.HTTP_409_CONFLICT,
                    code="CATEGORY_NAME_ALREADY_EXISTS",
                    message="A category with this name already exists",
                ) from exception

            if "slug" in error_message:
                raise AppException(
                    status_code=status.HTTP_409_CONFLICT,
                    code="CATEGORY_SLUG_ALREADY_EXISTS",
                    message="A category with this slug already exists",
                ) from exception

            raise AppException(
                status_code=status.HTTP_400_BAD_REQUEST,
                code="CREATE_CATEGORY_FAILED",
                message="Unable to create category",
            ) from exception

        except Exception:
            await db.rollback()
            raise

    async def get_category_detail(
        self,
        db: AsyncSession,
        category_id: uuid.UUID,
    ) -> Category:
        category = await self.category_repository.find_by_id(
            db=db,
            category_id=category_id,
        )

        if category is None:
            raise AppException(
                status_code=status.HTTP_404_NOT_FOUND,
                code="CATEGORY_NOT_FOUND",
                message="Category not found",
            )

        return category

    async def list_categories(
        self,
        db: AsyncSession,
        filters: CategoryListFilters,
    ) -> CategoryListData:
        categories, total = await self.category_repository.list_categories(
            db=db,
            filters=filters,
        )

        items = [
            CategoryListItem.model_validate(category) for category in categories
        ]

        return CategoryListData(
            items=items,
            page=filters.page,
            size=filters.size,
            total=total,
        )

    async def update_category(
        self,
        db: AsyncSession,
        category_id: uuid.UUID,
        request: UpdateCategoryRequest,
    ) -> Category:
        category = await self.category_repository.find_by_id(
            db=db,
            category_id=category_id,
        )

        if category is None:
            raise AppException(
                status_code=status.HTTP_404_NOT_FOUND,
                code="CATEGORY_NOT_FOUND",
                message="Category not found",
            )

        if request.name is not None and request.name != category.name:
            existing_name = await self.category_repository.find_by_name(
                db=db,
                name=request.name,
                exclude_id=category_id,
            )

            if existing_name is not None:
                raise AppException(
                    status_code=status.HTTP_409_CONFLICT,
                    code="CATEGORY_NAME_ALREADY_EXISTS",
                    message="A category with this name already exists",
                )

            category.name = request.name

        if request.slug is not None and request.slug != category.slug:
            existing_slug = await self.category_repository.find_by_slug(
                db=db,
                slug=request.slug,
                exclude_id=category_id,
            )

            if existing_slug is not None:
                raise AppException(
                    status_code=status.HTTP_409_CONFLICT,
                    code="CATEGORY_SLUG_ALREADY_EXISTS",
                    message="A category with this slug already exists",
                )

            category.slug = request.slug

        if request.status is not None:
            category.status = request.status

        try:
            updated_category = await self.category_repository.update(
                db=db,
                category=category,
            )
            await db.commit()

            return updated_category

        except IntegrityError as exception:
            await db.rollback()

            error_message = str(exception.orig).lower()

            if "name" in error_message:
                raise AppException(
                    status_code=status.HTTP_409_CONFLICT,
                    code="CATEGORY_NAME_ALREADY_EXISTS",
                    message="A category with this name already exists",
                ) from exception

            if "slug" in error_message:
                raise AppException(
                    status_code=status.HTTP_409_CONFLICT,
                    code="CATEGORY_SLUG_ALREADY_EXISTS",
                    message="A category with this slug already exists",
                ) from exception

            raise AppException(
                status_code=status.HTTP_400_BAD_REQUEST,
                code="UPDATE_CATEGORY_FAILED",
                message="Unable to update category",
            ) from exception

        except Exception:
            await db.rollback()
            raise

    async def delete_category(
        self,
        db: AsyncSession,
        category_id: uuid.UUID,
    ) -> None:
        category = await self.category_repository.find_by_id(
            db=db,
            category_id=category_id,
        )

        if category is None:
            raise AppException(
                status_code=status.HTTP_404_NOT_FOUND,
                code="CATEGORY_NOT_FOUND",
                message="Category not found",
            )

        if category.status == CategoryStatus.INACTIVE:
            raise AppException(
                status_code=status.HTTP_409_CONFLICT,
                code="CATEGORY_ALREADY_INACTIVE",
                message="Category is already inactive",
            )

        category.status = CategoryStatus.INACTIVE

        try:
            await self.category_repository.update(
                db=db,
                category=category,
            )
            await db.commit()

        except Exception:
            await db.rollback()
            raise