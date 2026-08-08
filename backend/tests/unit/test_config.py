import pytest

from auction_common.config import get_config


REQUIRED_ENV = ("TBL_ITEM_STATE", "TBL_BID_EVENTS")
OPTIONAL_ENV = (
    "AWS_REGION",
    "OWNER_REGION",
    "TBL_AUCTION_CATALOG",
    "TBL_WS_CONN",
    "TBL_ALIASES",
    "TBL_IDEMPOTENCY",
    "BID_QUEUE_URL",
    "WS_MGMT_ENDPOINT",
    "BROADCAST_FN_NAME",
    "DB_SECRET_ARN",
    "RDS_PROXY_HOST",
    "MEDIA_BUCKET",
    "SCHEDULER_GROUP",
    "SCHEDULER_ROLE_ARN",
    "SCHEDULER_DLQ_ARN",
    "ADMIN_COMMAND_ARN",
    "MAX_MEDIA_BYTES",
    "COGNITO_USER_POOL_ID",
    "BOOTSTRAP_ADMIN_SUB",
    "TBL_CATEGORY_CATALOG",
    "TBL_ADMIN_AUDIT_EVENTS",
)


@pytest.fixture(autouse=True)
def clear_config_cache(monkeypatch):
    get_config.cache_clear()
    for name in REQUIRED_ENV + OPTIONAL_ENV:
        monkeypatch.delenv(name, raising=False)
    yield
    get_config.cache_clear()


def test_config_reports_all_missing_required_environment_variables():
    with pytest.raises(RuntimeError) as exc_info:
        get_config()

    assert "TBL_ITEM_STATE" in str(exc_info.value)
    assert "TBL_BID_EVENTS" in str(exc_info.value)


def test_config_loads_required_tables_and_stage_one_defaults(monkeypatch):
    monkeypatch.setenv("TBL_ITEM_STATE", "la_item_auction_state")
    monkeypatch.setenv("TBL_BID_EVENTS", "la_bid_events")

    config = get_config()

    assert config.REGION == "ap-southeast-1"
    assert config.OWNER_REGION == "ap-southeast-1"
    assert config.T_STATE == "la_item_auction_state"
    assert config.T_EVENTS == "la_bid_events"
    assert config.T_CATALOG == ""
    assert config.T_CONN == ""
    assert config.BROADCAST_FN == ""
    assert config.MEDIA_BUCKET == ""
    assert config.SCHEDULER_GROUP == ""
    assert config.SCHEDULER_ROLE_ARN == ""
    assert config.SCHEDULER_DLQ_ARN == ""
    assert config.ADMIN_COMMAND_ARN == ""
    assert config.MAX_MEDIA_BYTES == 5 * 1024 * 1024
    assert config.COGNITO_USER_POOL_ID == ""
    assert config.BOOTSTRAP_ADMIN_SUB == ""
    assert config.T_CATEGORY_CATALOG == ""
    assert config.T_ADMIN_AUDIT_EVENTS == ""


def test_config_loads_optional_integration_values(monkeypatch):
    monkeypatch.setenv("TBL_ITEM_STATE", "state")
    monkeypatch.setenv("TBL_BID_EVENTS", "events")
    monkeypatch.setenv("TBL_AUCTION_CATALOG", "catalog")
    monkeypatch.setenv("TBL_IDEMPOTENCY", "idempotency")
    monkeypatch.setenv("BID_QUEUE_URL", "https://sqs.example/queue")
    monkeypatch.setenv("BROADCAST_FN_NAME", "la-broadcast")
    monkeypatch.setenv("MEDIA_BUCKET", "la-media")
    monkeypatch.setenv("SCHEDULER_GROUP", "la-schedules")
    monkeypatch.setenv("SCHEDULER_ROLE_ARN", "arn:aws:iam::123:role/scheduler")
    monkeypatch.setenv("SCHEDULER_DLQ_ARN", "arn:aws:sqs:region:123:dlq")
    monkeypatch.setenv("ADMIN_COMMAND_ARN", "arn:aws:lambda:region:123:function:admin")
    monkeypatch.setenv("MAX_MEDIA_BYTES", "1048576")
    monkeypatch.setenv("TBL_CATEGORY_CATALOG", "categories")
    monkeypatch.setenv("TBL_ADMIN_AUDIT_EVENTS", "audit")

    config = get_config()

    assert config.T_IDEMPOTENCY == "idempotency"
    assert config.T_CATALOG == "catalog"
    assert config.BID_QUEUE_URL == "https://sqs.example/queue"
    assert config.BROADCAST_FN == "la-broadcast"
    assert config.MEDIA_BUCKET == "la-media"
    assert config.SCHEDULER_GROUP == "la-schedules"
    assert config.SCHEDULER_ROLE_ARN == "arn:aws:iam::123:role/scheduler"
    assert config.SCHEDULER_DLQ_ARN == "arn:aws:sqs:region:123:dlq"
    assert config.ADMIN_COMMAND_ARN == "arn:aws:lambda:region:123:function:admin"
    assert config.MAX_MEDIA_BYTES == 1_048_576
    assert config.T_CATEGORY_CATALOG == "categories"
    assert config.T_ADMIN_AUDIT_EVENTS == "audit"
