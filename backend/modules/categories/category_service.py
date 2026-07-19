from fastapi import status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppException
from app.utils.slug import generate_slug
from common.enum import CategoryStatus
from app.models.category_model import Category
from modules.categories.category_repository import CategoryRepository
from modules.categories.category_schema import CreateCategoryRequest


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
