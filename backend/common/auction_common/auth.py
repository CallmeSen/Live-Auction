import os
from collections.abc import Mapping
from functools import lru_cache
from typing import Any

import jwt
from jwt import PyJWKClient

from auction_common.errors import AuthError


_ROLE_PRECEDENCE = ("ADMIN", "USER")
_INVALID_TOKEN = "invalid Cognito token"


@lru_cache(maxsize=1)
def _jwks() -> PyJWKClient:
    return PyJWKClient(_required_environment("COGNITO_JWKS_URL"))


def _required_environment(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise AuthError(_INVALID_TOKEN)
    return value


def verify_jwt(token: str | bytes) -> dict[str, Any]:
    try:
        if not isinstance(token, (str, bytes)) or not token:
            raise AuthError(_INVALID_TOKEN)

        client_id = _required_environment("COGNITO_CLIENT_ID")
        issuer = _required_environment("COGNITO_ISSUER")

        signing_key = _jwks().get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=client_id,
            issuer=issuer,
            options={"require": ["exp", "sub", "iss", "aud"]},
        )
        if not isinstance(claims, dict) or claims.get("token_use") != "id":
            raise AuthError("invalid token_use")
        return claims
    except AuthError:
        raise
    except Exception:
        raise AuthError(_INVALID_TOKEN) from None


def extract_role(claims: Mapping[str, Any]) -> str:
    if not isinstance(claims, Mapping):
        raise AuthError("no role group")

    groups = claims.get("cognito:groups")
    if isinstance(groups, str):
        groups = (groups,)
    elif isinstance(groups, list):
        groups = tuple(groups)
    else:
        raise AuthError("no role group")

    for role in _ROLE_PRECEDENCE:
        if role in groups:
            return role
    raise AuthError("no role group")
