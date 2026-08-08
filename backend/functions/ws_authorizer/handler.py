from typing import Literal, NotRequired, TypedDict

from aws_lambda_powertools import Logger
from aws_lambda_powertools.utilities.typing import LambdaContext

from auction_common.auth import extract_role, verify_jwt
from auction_common.errors import AuthError


logger = Logger(service="ws-authorizer")


class QueryStringParameters(TypedDict, total=False):
    token: str


class AuthorizerEvent(TypedDict):
    methodArn: str
    queryStringParameters: NotRequired[QueryStringParameters | None]


PolicyEffect = Literal["Allow", "Deny"]


class PolicyStatement(TypedDict):
    Action: Literal["execute-api:Invoke"]
    Effect: PolicyEffect
    Resource: str


class PolicyDocument(TypedDict):
    Version: Literal["2012-10-17"]
    Statement: list[PolicyStatement]


class PolicyResponse(TypedDict):
    principalId: str
    policyDocument: PolicyDocument
    context: NotRequired[dict[str, str]]


def _policy(
    principal: str,
    effect: PolicyEffect,
    resource: str,
    context: dict[str, str] | None = None,
) -> PolicyResponse:
    response: PolicyResponse = {
        "principalId": principal,
        "policyDocument": {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Action": "execute-api:Invoke",
                    "Effect": effect,
                    "Resource": resource,
                }
            ],
        },
    }
    if context:
        response["context"] = context
    return response


def _handle(event: AuthorizerEvent) -> PolicyResponse:
    method_arn = event["methodArn"]
    token = (event.get("queryStringParameters") or {}).get("token")
    if not token:
        return _policy("anonymous", "Deny", method_arn)

    try:
        claims = verify_jwt(token)
        role = extract_role(claims)
    except AuthError:
        logger.warning("Cognito authorization failed")
        return _policy("anonymous", "Deny", method_arn)

    return _policy(
        claims["sub"],
        "Allow",
        method_arn,
        {
            "sub": str(claims["sub"]),
            "email": str(claims.get("email", "")),
            "role": str(role),
        },
    )


@logger.inject_lambda_context(log_event=False)
def handler(event: AuthorizerEvent, context: LambdaContext) -> PolicyResponse:
    return _handle(event)
