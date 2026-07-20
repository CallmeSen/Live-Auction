import bcrypt
import jwt
from datetime import datetime, timedelta, timezone
from typing import Any

from app.core.exceptions import AppException
from app.core.config import settings


def hash_password(password: str) -> str:
    password_bytes = password.encode("utf-8")

    salt = bcrypt.gensalt()
    hashed_password = bcrypt.hashpw(password_bytes, salt)

    return hashed_password.decode("utf-8")

def verify_password(
    plain_password: str,
    hashed_password: str,
) -> bool:
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8"),
        )
    except (ValueError, TypeError):
        return False

def create_access_token(
    subject: str,
    additional_claims: dict[str, Any] | None = None,
) -> str:
    now = datetime.now(timezone.utc)

    expires_at = now + timedelta(
        minutes=settings.access_token_expire_minutes
    )

    payload: dict[str, Any] = {
        "sub": subject,
        "type": "access",
        "iat": now,
        "exp": expires_at,
    }

    if additional_claims:
        payload.update(additional_claims)

    return jwt.encode(
        payload,
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
        )
    except jwt.ExpiredSignatureError as exception:
        raise AppException(
            status_code=401,
            code="INVALID_ACCESS_TOKEN",
            message="Access token is invalid or expired",
        ) from exception
    except jwt.InvalidTokenError as exception:
        raise AppException(
            status_code=401,
            code="INVALID_ACCESS_TOKEN",
            message="Access token is invalid or expired",
        ) from exception

    if payload.get("type") != "access":
        raise AppException(
            status_code=401,
            code="INVALID_ACCESS_TOKEN",
            message="Access token is invalid or expired",
        )

    return payload