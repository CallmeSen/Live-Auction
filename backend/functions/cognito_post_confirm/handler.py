import os

import boto3


TRIGGER = "PostConfirmation_ConfirmSignUp"
USER_GROUP_NAME = os.environ.get("USER_GROUP_NAME", "USER")


def cognito_client():
    return boto3.client("cognito-idp")


def handler(event, context):
    del context
    user_pool_id = event.get("userPoolId")
    username = event.get("userName")
    trigger_source = event.get("triggerSource")
    if trigger_source is not None and trigger_source != TRIGGER:
        return event
    if not isinstance(user_pool_id, str) or not user_pool_id.strip() or not isinstance(username, str) or not username.strip():
        raise ValueError("incomplete Cognito event")

    cognito_client().admin_add_user_to_group(
        UserPoolId=user_pool_id.strip(),
        Username=username.strip(),
        GroupName=USER_GROUP_NAME,
    )
    return event
