import json
import os
from inspect import get_annotations
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace
from typing import Literal
from unittest.mock import Mock

from auction_common.errors import AuthError

import functions.ws_authorizer.handler as module


METHOD_ARN = "arn:aws:execute-api:ap-southeast-2:123456789012:api/$connect"


def lambda_context():
    return SimpleNamespace(
        function_name="ws-authorizer",
        memory_limit_in_mb=128,
        invoked_function_arn="arn:aws:lambda:region:account:function:ws-authorizer",
        aws_request_id="request-id",
    )


def assert_policy(response, *, effect, principal_id, resource=METHOD_ARN):
    assert response["principalId"] == principal_id
    assert response["policyDocument"] == {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Action": "execute-api:Invoke",
                "Effect": effect,
                "Resource": resource,
            }
        ],
    }


def test_authorizer_annotations_describe_lambda_and_policy_contract():
    policy_annotations = get_annotations(module._policy, eval_str=True)
    handle_annotations = get_annotations(module._handle, eval_str=True)
    handler_annotations = get_annotations(module.handler, eval_str=True)

    assert policy_annotations["effect"] == Literal["Allow", "Deny"]
    assert policy_annotations["return"].__name__ == "PolicyResponse"
    assert handle_annotations["event"].__name__ == "AuthorizerEvent"
    assert handle_annotations["return"].__name__ == "PolicyResponse"
    assert handler_annotations["event"].__name__ == "AuthorizerEvent"
    assert handler_annotations["context"].__name__ == "LambdaContext"
    assert handler_annotations["return"].__name__ == "PolicyResponse"


def test_missing_token_returns_deny_policy():
    response = module._handle(
        {"queryStringParameters": None, "methodArn": METHOD_ARN}
    )

    assert_policy(response, effect="Deny", principal_id="anonymous")
    assert "context" not in response


def test_invalid_token_returns_deny_without_token_or_error(monkeypatch):
    token = "secret-token-value"
    error_message = f"verification failed for {token}"
    verify_jwt = Mock(side_effect=AuthError(error_message))
    extract_role = Mock()
    monkeypatch.setattr(module, "verify_jwt", verify_jwt)
    monkeypatch.setattr(module, "extract_role", extract_role)

    response = module._handle(
        {
            "queryStringParameters": {"token": token},
            "methodArn": METHOD_ARN,
        }
    )

    assert_policy(response, effect="Deny", principal_id="anonymous")
    assert "context" not in response
    serialized = json.dumps(response)
    assert token not in serialized
    assert error_message not in serialized
    verify_jwt.assert_called_once_with(token)
    extract_role.assert_not_called()


def test_invalid_role_returns_deny_without_context_token_or_error(monkeypatch):
    token = "secret-role-token"
    error_message = f"unsupported role from {token}"
    claims = {
        "sub": "user-123",
        "email": "bidder@example.test",
        "cognito:groups": ["VIEWER"],
    }
    verify_jwt = Mock(return_value=claims)
    extract_role = Mock(side_effect=AuthError(error_message))
    monkeypatch.setattr(module, "verify_jwt", verify_jwt)
    monkeypatch.setattr(module, "extract_role", extract_role)

    response = module._handle(
        {
            "queryStringParameters": {"token": token},
            "methodArn": METHOD_ARN,
        }
    )

    assert_policy(response, effect="Deny", principal_id="anonymous")
    assert "context" not in response
    serialized = json.dumps(response)
    assert token not in serialized
    assert error_message not in serialized
    verify_jwt.assert_called_once_with(token)
    extract_role.assert_called_once_with(claims)


def test_valid_token_returns_allow_policy_and_identity_context(monkeypatch):
    token = "secret-token-value"
    claims = {
        "sub": "user-123",
        "email": "bidder@example.test",
        "cognito:groups": ["BIDDER"],
    }
    verify_jwt = Mock(return_value=claims)
    extract_role = Mock(return_value="BIDDER")
    monkeypatch.setattr(module, "verify_jwt", verify_jwt)
    monkeypatch.setattr(module, "extract_role", extract_role)

    response = module._handle(
        {
            "queryStringParameters": {"token": token},
            "methodArn": METHOD_ARN,
        }
    )

    assert_policy(response, effect="Allow", principal_id="user-123")
    assert response["context"] == {
        "sub": "user-123",
        "email": "bidder@example.test",
        "role": "BIDDER",
    }
    assert all(isinstance(value, str) for value in response["context"].values())
    verify_jwt.assert_called_once_with(token)
    extract_role.assert_called_once_with(claims)


def test_handler_delegates_to_handle(monkeypatch):
    event = {"queryStringParameters": None, "methodArn": METHOD_ARN}
    expected = {"delegated": True}
    handle = Mock(return_value=expected)
    monkeypatch.setattr(module, "_handle", handle)

    assert module.handler(event, lambda_context()) == expected
    handle.assert_called_once_with(event)


def test_handler_never_logs_token_when_event_logging_env_is_true():
    token = "secret-event-token"
    script = "\n".join(
        [
            "from types import SimpleNamespace",
            "import functions.ws_authorizer.handler as module",
            "module.verify_jwt = lambda token: "
            "{'sub': 'user-123', 'email': 'bidder@example.test'}",
            "module.extract_role = lambda claims: 'BIDDER'",
            "module.handler(",
            f"    {{'queryStringParameters': {{'token': '{token}'}}, "
            f"'methodArn': '{METHOD_ARN}'}},",
            "    SimpleNamespace(",
            "        function_name='ws-authorizer',",
            "        memory_limit_in_mb=128,",
            "        invoked_function_arn='arn:aws:lambda:region:function',",
            "        aws_request_id='request-id',",
            "    ),",
            ")",
        ]
    )
    env = os.environ.copy()
    env.pop("LOG_LEVEL", None)
    env.pop("POWERTOOLS_LOG_LEVEL", None)
    env.pop("AWS_LAMBDA_LOG_LEVEL", None)
    env["POWERTOOLS_LOGGER_LOG_EVENT"] = "true"
    env["POWERTOOLS_LOG_LEVEL"] = "INFO"

    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=Path(__file__).parents[2],
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    captured = result.stdout + result.stderr
    assert result.returncode == 0, captured
    assert token not in captured


def test_handler_denial_log_never_contains_auth_error_or_token():
    token = "secret-denial-token"
    error_message = f"invalid credentials for {token}"
    script = "\n".join(
        [
            "from types import SimpleNamespace",
            "from auction_common.errors import AuthError",
            "import functions.ws_authorizer.handler as module",
            "module.verify_jwt = lambda token: "
            "{'sub': 'user-123', 'email': 'bidder@example.test'}",
            f"def reject_role(claims): raise AuthError('{error_message}')",
            "module.extract_role = reject_role",
            "module.handler(",
            f"    {{'queryStringParameters': {{'token': '{token}'}}, "
            f"'methodArn': '{METHOD_ARN}'}},",
            "    SimpleNamespace(",
            "        function_name='ws-authorizer',",
            "        memory_limit_in_mb=128,",
            "        invoked_function_arn='arn:aws:lambda:region:function',",
            "        aws_request_id='request-id',",
            "    ),",
            ")",
        ]
    )
    env = os.environ.copy()
    env.pop("LOG_LEVEL", None)
    env.pop("POWERTOOLS_LOG_LEVEL", None)
    env.pop("AWS_LAMBDA_LOG_LEVEL", None)
    env["POWERTOOLS_LOGGER_LOG_EVENT"] = "true"
    env["POWERTOOLS_LOG_LEVEL"] = "INFO"

    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=Path(__file__).parents[2],
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    captured = result.stdout + result.stderr
    assert result.returncode == 0, captured
    assert token not in captured
    assert error_message not in captured
