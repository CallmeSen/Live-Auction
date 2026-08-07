import os
from dataclasses import dataclass
from functools import lru_cache


@dataclass(frozen=True, slots=True)
class Config:
    REGION: str
    OWNER_REGION: str
    T_STATE: str
    T_EVENTS: str
    T_CATALOG: str
    T_CONN: str
    T_ALIAS: str
    T_IDEMPOTENCY: str
    T_CATEGORY_CATALOG: str
    T_ADMIN_AUDIT_EVENTS: str
    BID_QUEUE_URL: str
    WS_ENDPOINT: str
    BROADCAST_FN: str
    DB_SECRET_ARN: str
    RDS_PROXY_HOST: str
    MEDIA_BUCKET: str
    SCHEDULER_GROUP: str
    SCHEDULER_ROLE_ARN: str
    SCHEDULER_DLQ_ARN: str
    ADMIN_COMMAND_ARN: str
    MAX_MEDIA_BYTES: int
    COGNITO_USER_POOL_ID: str
    BOOTSTRAP_ADMIN_SUB: str

    @classmethod
    def from_environment(cls) -> "Config":
        required = ("TBL_ITEM_STATE", "TBL_BID_EVENTS")
        missing = [name for name in required if not os.environ.get(name)]
        if missing:
            names = ", ".join(missing)
            raise RuntimeError(f"Missing required environment variables: {names}")

        return cls(
            REGION=os.environ.get("AWS_REGION", "ap-southeast-1"),
            OWNER_REGION=os.environ.get("OWNER_REGION", "ap-southeast-1"),
            T_STATE=os.environ["TBL_ITEM_STATE"],
            T_EVENTS=os.environ["TBL_BID_EVENTS"],
            T_CATALOG=os.environ.get("TBL_AUCTION_CATALOG", ""),
            T_CONN=os.environ.get("TBL_WS_CONN", ""),
            T_ALIAS=os.environ.get("TBL_ALIASES", ""),
            T_IDEMPOTENCY=os.environ.get("TBL_IDEMPOTENCY", ""),
            T_CATEGORY_CATALOG=os.environ.get("TBL_CATEGORY_CATALOG", ""),
            T_ADMIN_AUDIT_EVENTS=os.environ.get("TBL_ADMIN_AUDIT_EVENTS", ""),
            BID_QUEUE_URL=os.environ.get("BID_QUEUE_URL", ""),
            WS_ENDPOINT=os.environ.get("WS_MGMT_ENDPOINT", ""),
            BROADCAST_FN=os.environ.get("BROADCAST_FN_NAME", ""),
            DB_SECRET_ARN=os.environ.get("DB_SECRET_ARN", ""),
            RDS_PROXY_HOST=os.environ.get("RDS_PROXY_HOST", ""),
            MEDIA_BUCKET=os.environ.get("MEDIA_BUCKET", ""),
            SCHEDULER_GROUP=os.environ.get("SCHEDULER_GROUP", ""),
            SCHEDULER_ROLE_ARN=os.environ.get("SCHEDULER_ROLE_ARN", ""),
            SCHEDULER_DLQ_ARN=os.environ.get("SCHEDULER_DLQ_ARN", ""),
            ADMIN_COMMAND_ARN=os.environ.get("ADMIN_COMMAND_ARN", ""),
            MAX_MEDIA_BYTES=int(os.environ.get("MAX_MEDIA_BYTES", "5242880")),
            COGNITO_USER_POOL_ID=os.environ.get("COGNITO_USER_POOL_ID", ""),
            BOOTSTRAP_ADMIN_SUB=os.environ.get("BOOTSTRAP_ADMIN_SUB", ""),
        )


@lru_cache(maxsize=1)
def get_config() -> Config:
    return Config.from_environment()
