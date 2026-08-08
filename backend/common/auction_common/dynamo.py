from functools import lru_cache

import boto3


@lru_cache(maxsize=1)
def ddb():
    return boto3.resource("dynamodb")


@lru_cache(maxsize=None)
def table(name: str):
    return ddb().Table(name)
