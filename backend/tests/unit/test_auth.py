import inspect
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from auction_common.errors import AuthError
import auction_common.auth as auth


COGNITO_ENV = {
    "COGNITO_JWKS_URL": "https://cognito.example/jwks.json",
    "COGNITO_CLIENT_ID": "client-id",
    "COGNITO_ISSUER": "https://cognito.example/issuer",
}


@pytest.fixture(autouse=True)
def clear_auth_cache(monkeypatch):
    auth._jwks.cache_clear()
    for name in COGNITO_ENV:
        monkeypatch.delenv(name, raising=False)
    yield
    auth._jwks.cache_clear()


def configure_cognito(monkeypatch):
    for name, value in COGNITO_ENV.items():
        monkeypatch.setenv(name, value)


def jwt_claims(**overrides):
    claims = {
        "exp": 1_900_000_000,
        "sub": "user-123",
        "iss": COGNITO_ENV["COGNITO_ISSUER"],
        "aud": COGNITO_ENV["COGNITO_CLIENT_ID"],
        "token_use": "id",
    }
    claims.update(overrides)
    return claims


def stub_jwt(monkeypatch, *, claims=None, key_error=None, decode_error=None):
    configure_cognito(monkeypatch)
    jwks_client = Mock()
    jwks_client.get_signing_key_from_jwt.return_value = SimpleNamespace(
        key="public-key"
    )
    if key_error is not None:
        jwks_client.get_signing_key_from_jwt.side_effect = key_error

    client_factory = Mock(return_value=jwks_client)
    monkeypatch.setattr(auth, "PyJWKClient", client_factory)

    decoder = Mock(return_value=jwt_claims() if claims is None else claims)
    if decode_error is not None:
        decoder.side_effect = decode_error
    monkeypatch.setattr(auth.jwt, "decode", decoder)
    return client_factory, jwks_client, decoder


def test_extract_role_prefers_admin_over_seller_and_bidder():
    claims = {"cognito:groups": ["BIDDER", "SELLER", "ADMIN"]}

    assert auth.extract_role(claims) == "ADMIN"


def test_extract_role_prefers_seller_over_bidder():
    claims = {"cognito:groups": ["BIDDER", "SELLER"]}

    assert auth.extract_role(claims) == "SELLER"


def test_extract_role_accepts_a_string_group():
    assert auth.extract_role({"cognito:groups": "BIDDER"}) == "BIDDER"


@pytest.mark.parametrize(
    "claims",
    [
        {},
        {"cognito:groups": []},
        {"cognito:groups": ["VIEWER"]},
        {"cognito:groups": None},
    ],
)
def test_extract_role_rejects_missing_or_unsupported_group(claims):
    with pytest.raises(AuthError) as exc_info:
        auth.extract_role(claims)

    assert str(exc_info.value) == "no role group"


def test_verify_jwt_uses_cognito_decode_contract(monkeypatch):
    client_factory, jwks_client, decoder = stub_jwt(monkeypatch)

    result = auth.verify_jwt("signed-token")

    assert result["sub"] == "user-123"
    client_factory.assert_called_once_with(COGNITO_ENV["COGNITO_JWKS_URL"])
    jwks_client.get_signing_key_from_jwt.assert_called_once_with("signed-token")
    decoder.assert_called_once_with(
        "signed-token",
        "public-key",
        algorithms=["RS256"],
        audience=COGNITO_ENV["COGNITO_CLIENT_ID"],
        issuer=COGNITO_ENV["COGNITO_ISSUER"],
        options={"require": ["exp", "sub", "iss", "aud"]},
    )


def test_verify_jwt_declares_and_accepts_bytes_tokens(monkeypatch):
    _, jwks_client, decoder = stub_jwt(monkeypatch)
    token = b"signed-token"

    annotation = inspect.signature(auth.verify_jwt).parameters["token"].annotation
    result = auth.verify_jwt(token)

    assert annotation == str | bytes
    assert result["sub"] == "user-123"
    jwks_client.get_signing_key_from_jwt.assert_called_once_with(token)
    decoder.assert_called_once_with(
        token,
        "public-key",
        algorithms=["RS256"],
        audience=COGNITO_ENV["COGNITO_CLIENT_ID"],
        issuer=COGNITO_ENV["COGNITO_ISSUER"],
        options={"require": ["exp", "sub", "iss", "aud"]},
    )


def test_verify_jwt_reuses_the_cached_jwks_client(monkeypatch):
    client_factory, jwks_client, decoder = stub_jwt(monkeypatch)

    auth.verify_jwt("first-token")
    auth.verify_jwt("second-token")

    client_factory.assert_called_once_with(COGNITO_ENV["COGNITO_JWKS_URL"])
    assert jwks_client.get_signing_key_from_jwt.call_count == 2
    assert decoder.call_count == 2


@pytest.mark.parametrize("token_use", [None, "access"])
def test_verify_jwt_rejects_non_id_tokens(monkeypatch, token_use):
    claims = jwt_claims()
    if token_use is None:
        del claims["token_use"]
    else:
        claims["token_use"] = token_use
    stub_jwt(monkeypatch, claims=claims)

    with pytest.raises(AuthError) as exc_info:
        auth.verify_jwt("signed-token")

    assert str(exc_info.value) == "invalid token_use"


def test_verify_jwt_rejects_missing_configuration(monkeypatch):
    monkeypatch.setenv("COGNITO_CLIENT_ID", COGNITO_ENV["COGNITO_CLIENT_ID"])
    monkeypatch.setenv("COGNITO_ISSUER", COGNITO_ENV["COGNITO_ISSUER"])

    with pytest.raises(AuthError) as exc_info:
        auth.verify_jwt("signed-token")

    assert str(exc_info.value) == "invalid Cognito token"


def test_verify_jwt_wraps_key_errors_without_leaking_token(monkeypatch):
    token = "secret-token-value"
    _, _, decoder = stub_jwt(
        monkeypatch,
        key_error=RuntimeError(f"key lookup failed for {token}"),
    )

    with pytest.raises(AuthError) as exc_info:
        auth.verify_jwt(token)

    assert str(exc_info.value) == "invalid Cognito token"
    assert token not in str(exc_info.value)
    assert decoder.call_count == 0


def test_verify_jwt_wraps_decode_errors_without_leaking_token(monkeypatch):
    token = "secret-token-value"
    _, _, _ = stub_jwt(
        monkeypatch,
        decode_error=ValueError(f"decode failed for {token}"),
    )

    with pytest.raises(AuthError) as exc_info:
        auth.verify_jwt(token)

    assert str(exc_info.value) == "invalid Cognito token"
    assert token not in str(exc_info.value)
