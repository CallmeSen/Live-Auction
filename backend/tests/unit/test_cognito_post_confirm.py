from unittest.mock import Mock

import pytest

import functions.cognito_post_confirm.handler as module


def test_assigns_confirmed_user_to_user_group(monkeypatch):
    client = Mock()
    monkeypatch.setattr(module, "cognito_client", lambda: client)
    event = {
        "userPoolId": "ap-southeast-1_example",
        "userName": "user-123",
    }

    assert module.handler(event, None) == event
    client.admin_add_user_to_group.assert_called_once_with(
        UserPoolId="ap-southeast-1_example",
        Username="user-123",
        GroupName="USER",
    )


@pytest.mark.parametrize("event", [{}, {"userPoolId": "pool"}, {"userName": "user"}])
def test_rejects_incomplete_cognito_event(monkeypatch, event):
    client = Mock()
    monkeypatch.setattr(module, "cognito_client", lambda: client)

    with pytest.raises(ValueError, match="incomplete Cognito event"):
        module.handler(event, None)

    client.admin_add_user_to_group.assert_not_called()
