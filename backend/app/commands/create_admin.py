import asyncio
import os
import re
import sys
from dataclasses import dataclass

from email_validator import EmailNotValidError, validate_email
from sqlalchemy.exc import IntegrityError

import app.models  # noqa: F401
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.security import hash_password
from app.models.user_model import User
from app.utils.password import validate_admin_password
from common.enum import UserRole, UserStatus
from modules.users.user_repository import UserRepository

REQUIRED_ENV_VARS = (
    "INITIAL_ADMIN_EMAIL",
    "INITIAL_ADMIN_PASSWORD",
    "INITIAL_ADMIN_FULL_NAME",
    "INITIAL_ADMIN_PHONE",
)


@dataclass(frozen=True)
class InitialAdminConfig:
    email: str
    password: str
    full_name: str
    phone: str


def _require_env(name: str) -> str:
    value = os.environ.get(name)

    if value is None or not value.strip():
        raise ValueError(f"Missing required environment variable: {name}")

    return value


def _validate_email(email: str) -> str:
    normalized_email = email.strip().lower()

    if not normalized_email:
        raise ValueError("INITIAL_ADMIN_EMAIL must not be blank")

    if len(normalized_email) > 255:
        raise ValueError("INITIAL_ADMIN_EMAIL must not exceed 255 characters")

    try:
        validate_email(normalized_email, check_deliverability=False)
    except EmailNotValidError as exception:
        raise ValueError(
            "INITIAL_ADMIN_EMAIL must be a valid email address"
        ) from exception

    return normalized_email


def _validate_full_name(full_name: str) -> str:
    normalized_name = full_name.strip()

    if len(normalized_name) < 2:
        raise ValueError(
            "INITIAL_ADMIN_FULL_NAME must be at least 2 characters"
        )

    if len(normalized_name) > 255:
        raise ValueError(
            "INITIAL_ADMIN_FULL_NAME must not exceed 255 characters"
        )

    return normalized_name


def _validate_phone(phone: str) -> str:
    normalized_phone = re.sub(r"[\s-]", "", phone.strip())

    if not normalized_phone:
        raise ValueError("INITIAL_ADMIN_PHONE must not be blank")

    if len(phone.strip()) > 30:
        raise ValueError("INITIAL_ADMIN_PHONE must not exceed 30 characters")

    if not re.fullmatch(r"\+?\d{9,15}", normalized_phone):
        raise ValueError(
            "INITIAL_ADMIN_PHONE must contain 9 to 15 digits "
            "and may start with +"
        )

    return normalized_phone


def load_initial_admin_config() -> InitialAdminConfig:
    for name in REQUIRED_ENV_VARS:
        _require_env(name)

    email = _validate_email(os.environ["INITIAL_ADMIN_EMAIL"])
    password = os.environ["INITIAL_ADMIN_PASSWORD"]
    full_name = _validate_full_name(os.environ["INITIAL_ADMIN_FULL_NAME"])
    phone = _validate_phone(os.environ["INITIAL_ADMIN_PHONE"])

    validate_admin_password(password)

    return InitialAdminConfig(
        email=email,
        password=password,
        full_name=full_name,
        phone=phone,
    )


async def create_initial_admin(config: InitialAdminConfig) -> int:
    repository = UserRepository()

    async with AsyncSessionLocal() as db:
        try:
            existing_user = await repository.find_by_email(
                db=db,
                email=config.email,
            )

            if existing_user is not None:
                if existing_user.role == UserRole.ADMIN:
                    print(
                        f"Initial admin already exists: {config.email}"
                    )
                    return 0

                print(
                    "Error: the email belongs to an existing non-admin user. "
                    "Refusing to promote the account.",
                    file=sys.stderr,
                )
                return 1

            user = User(
                email=config.email,
                password_hash=hash_password(config.password),
                full_name=config.full_name,
                phone=config.phone,
                role=UserRole.ADMIN,
                status=UserStatus.ACTIVE,
                is_primary_admin=True,
            )

            await repository.create(db=db, user=user)
            await db.commit()

            print(f"Initial admin created successfully: {config.email}")
            return 0

        except IntegrityError:
            await db.rollback()

            existing_user = await repository.find_by_email(
                db=db,
                email=config.email,
            )

            if (
                existing_user is not None
                and existing_user.role == UserRole.ADMIN
            ):
                print(
                    f"Initial admin already exists: {config.email}"
                )
                return 0

            print(
                "Error: failed to create initial admin due to a "
                "database conflict.",
                file=sys.stderr,
            )
            return 1

        except Exception as exception:
            await db.rollback()

            print(f"Error: {exception}", file=sys.stderr)
            return 1


def main() -> None:
    _ = settings

    try:
        config = load_initial_admin_config()
    except ValueError as exception:
        print(f"Error: {exception}", file=sys.stderr)
        sys.exit(1)

    exit_code = asyncio.run(create_initial_admin(config))
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
