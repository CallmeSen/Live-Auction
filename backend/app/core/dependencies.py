import uuid
from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.exceptions import AppException
from app.core.security import decode_access_token


security = HTTPBearer(
    scheme_name="BearerAuth",
    description="JWT access token from POST /api/v1/auth/login",
)


async def get_current_user_id(
    credentials: Annotated[
        HTTPAuthorizationCredentials,
        Depends(security),
    ],
) -> uuid.UUID:
    payload = decode_access_token(credentials.credentials)

    subject = payload.get("sub")

    if not subject:
        raise AppException(
            status_code=401,
            code="INVALID_TOKEN",
            message="Invalid access token",
        )

    try:
        return uuid.UUID(str(subject))
    except ValueError as exception:
        raise AppException(
            status_code=401,
            code="INVALID_TOKEN",
            message="Invalid access token",
        ) from exception
