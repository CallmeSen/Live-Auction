import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppException
from app.core.security import decode_access_token
from app.models.user_model import User
from common.enum import UserStatus
from modules.users.user_repository import UserRepository


async def resolve_websocket_user(
    token: str | None,
    db: AsyncSession,
) -> User | None:
    if not token:
        return None

    try:
        payload = decode_access_token(token)
        subject = payload.get("sub")

        if not subject:
            return None

        user_id = uuid.UUID(str(subject))
    except (AppException, ValueError, TypeError):
        return None

    user = await UserRepository().find_by_id(
        db=db,
        user_id=user_id,
    )

    if user is None or user.status != UserStatus.ACTIVE:
        return None

    return user
