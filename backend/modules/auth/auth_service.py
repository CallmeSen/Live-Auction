from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from modules.auth.auth_schema import RegisterRequest
from common.enum import UserRole, UserStatus
from app.core.exceptions import AppException
from app.core.security import hash_password
from modules.users.user_model import User
from modules.users.user_repository import UserRepository


class AuthService:
    def __init__(
        self,
        user_repository: UserRepository,
    ) -> None:
        self.user_repository = user_repository

    async def register(
        self,
        db: AsyncSession,
        request: RegisterRequest,
    ) -> User:
        # 1. Check whether email is already registered.
        existing_user = await self.user_repository.find_by_email(
            db=db,
            email=str(request.email),
        )

        if existing_user is not None:
            raise AppException(
                status_code=400,
                code="EMAIL_ALREADY_EXISTS",
                message="Email already exists",
            )

        # 2. Hash the password before creating the database model.
        password_hash = hash_password(request.password)

        # 3. Create server-controlled user data.
        user = User(
            email=str(request.email),
            password_hash=password_hash,
            full_name=request.full_name,
            phone=request.phone,
            role=UserRole.USER,
            status=UserStatus.ACTIVE,
        )

        try:
            # 4. Stage INSERT through the repository.
            created_user = await self.user_repository.create(
                db=db,
                user=user,
            )

            # 5. Finalize the complete use case.
            await db.commit()

            return created_user

        except IntegrityError as exception:
            await db.rollback()

            # The database unique constraint may detect a duplicate
            # created by two concurrent requests.
            raise AppException(
                status_code=400,
                code="EMAIL_ALREADY_EXISTS",
                message="Email already exists",
            ) from exception

        except Exception:
            await db.rollback()
            raise