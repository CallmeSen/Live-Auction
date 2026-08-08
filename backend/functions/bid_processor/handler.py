import json
import time
from decimal import Decimal
from functools import lru_cache

import boto3
from aws_lambda_powertools import Logger, Metrics
from aws_lambda_powertools.metrics import MetricUnit
from aws_lambda_powertools.utilities.batch import (
    BatchProcessor,
    EventType,
    process_partial_response,
)
from botocore.exceptions import ClientError

from auction_common.config import get_config
from auction_common.dynamo import table
from auction_common.errors import ACCEPTED, RejectReason
from auction_common.models import BidCommand, BidResult, SessionRules


logger = Logger(service="bid-processor")
metrics = Metrics(namespace="LiveAuction")
processor = BatchProcessor(event_type=EventType.SQS)
RULES = SessionRules()


def _rules_from_state(state: dict) -> SessionRules:
    values = {
        name: state[name] for name in SessionRules.model_fields if name in state
    }
    return SessionRules.model_validate(values)


def _apply_rules(
    cmd: BidCommand,
    state: dict,
    now: int,
    rules: SessionRules | None = None,
) -> BidResult:
    """Evaluate one bid without making network or database calls."""
    del now
    effective_rules = rules or RULES

    def reject(reason: RejectReason) -> BidResult:
        return BidResult(
            item_id=cmd.item_id,
            request_id=cmd.request_id,
            status="REJECTED",
            reason=reason,
            connection_id=cmd.connection_id,
        )

    if cmd.owner_region != state.get("owner_region"):
        return reject(RejectReason.REGION)
    if state.get("status") != "LIVE":
        return reject(RejectReason.NOT_LIVE)
    if cmd.user_sub == state.get("seller_sub"):
        return reject(RejectReason.SELLER_BID)

    current_price = Decimal(str(state["current_price"]))
    if cmd.amount < current_price + effective_rules.min_increment:
        return reject(RejectReason.LOW_INCREMENT)
    if cmd.amount > current_price + effective_rules.max_increment:
        return reject(RejectReason.HIGH_INCREMENT)

    return BidResult(
        item_id=cmd.item_id,
        request_id=cmd.request_id,
        status=ACCEPTED,
        current_price=cmd.amount,
        connection_id=cmd.connection_id,
    )


def _evaluate_anti_snipe(
    state: dict, now: int, rules: SessionRules | None = None
) -> tuple[int, int]:
    """Return the updated end time and extension count."""
    effective_rules = rules or RULES
    end_time = int(state["end_time"])
    extension_count = int(state.get("extension_count", 0))
    if (
        end_time - now <= effective_rules.anti_snipe_window_s
        and extension_count < effective_rules.max_extensions
    ):
        return now + effective_rules.anti_snipe_extend_s, extension_count + 1
    return end_time, extension_count


def _is_duplicate(item_id: str, request_id: str) -> bool:
    cfg = get_config()
    response = table(cfg.T_EVENTS).query(
        KeyConditionExpression="item_id = :i",
        FilterExpression="request_id = :r",
        ExpressionAttributeValues={":i": item_id, ":r": request_id},
        Limit=1,
    )
    return response.get("Count", 0) > 0


def _commit(
    cmd: BidCommand,
    state: dict,
    result: BidResult,
    now: int,
    rules: SessionRules | None = None,
) -> int | None:
    cfg = get_config()
    effective_rules = rules or RULES
    new_end, new_extension_count = _evaluate_anti_snipe(
        state, now, effective_rules
    )
    try:
        table(cfg.T_STATE).update_item(
            Key={"item_id": cmd.item_id},
            UpdateExpression=(
                "SET current_price = :amount, highest_bidder_id = :bidder, "
                "end_time = :end_time, extension_count = :extensions, "
                "version = version + :one"
            ),
            ConditionExpression=(
                "#status = :live AND current_price < :amount AND version = :version"
            ),
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={
                ":amount": cmd.amount,
                ":bidder": cmd.user_sub,
                ":end_time": new_end,
                ":extensions": new_extension_count,
                ":one": 1,
                ":live": "LIVE",
                ":version": state["version"],
            },
        )
        result.end_time = new_end
        if new_extension_count != int(state.get("extension_count", 0)):
            metrics.add_metric(
                name="AntiSnipingExtension", unit=MetricUnit.Count, value=1
            )
            logger.info(
                "anti-snipe extended",
                extra={"item_id": cmd.item_id, "new_end": new_end},
            )
    except ClientError as error:
        if error.response["Error"]["Code"] == "ConditionalCheckFailedException":
            result.status = "REJECTED"
            result.reason = RejectReason.LOW_INCREMENT
            return None
        else:
            raise
    return new_extension_count


def _write_audit(cmd: BidCommand, result: BidResult, now_ms: int) -> None:
    cfg = get_config()
    table(cfg.T_EVENTS).put_item(
        Item={
            "item_id": cmd.item_id,
            "sk": f"{now_ms}#{cmd.request_id}",
            "request_id": cmd.request_id,
            "amount": cmd.amount,
            "status": result.status,
            "reason": result.reason or "",
            "bidder_sub": cmd.user_sub,
        }
    )


@lru_cache(maxsize=1)
def _lambda_client():
    return boto3.client("lambda")


def _notify_broadcast(
    result: BidResult,
    extension_count: int | None = None,
) -> None:
    cfg = get_config()
    if not cfg.BROADCAST_FN:
        return
    broadcast_result = json.loads(result.model_dump_json())
    if result.status == ACCEPTED and extension_count is not None:
        broadcast_result["extension_count"] = extension_count
    _lambda_client().invoke(
        FunctionName=cfg.BROADCAST_FN,
        InvocationType="Event",
        Payload=json.dumps(
            {
                "item_id": result.item_id,
                "result": broadcast_result,
            }
        ).encode(),
    )


def _process_one(record) -> None:
    started_at = time.time()
    now = int(started_at)
    command = BidCommand.model_validate_json(record.body)

    if _is_duplicate(command.item_id, command.request_id):
        logger.info("duplicate bid", extra={"request_id": command.request_id})
        metrics.add_metric(name="RejectedBid", unit=MetricUnit.Count, value=1)
        return

    cfg = get_config()
    response = table(cfg.T_STATE).get_item(
        Key={"item_id": command.item_id}, ConsistentRead=True
    )
    if "Item" not in response:
        logger.warning("item state not found", extra={"item_id": command.item_id})
        return

    state = response["Item"]
    rules = _rules_from_state(state)
    result = _apply_rules(command, state, now, rules)
    extension_count = None
    if result.status == ACCEPTED:
        extension_count = _commit(command, state, result, now, rules)

    _write_audit(command, result, int(started_at * 1000))
    _notify_broadcast(result, extension_count)
    metrics.add_metric(
        name="BidLatency",
        unit=MetricUnit.Milliseconds,
        value=(time.time() - started_at) * 1000,
    )
    metrics.add_metric(
        name="AcceptedBid" if result.status == ACCEPTED else "RejectedBid",
        unit=MetricUnit.Count,
        value=1,
    )


@logger.inject_lambda_context
@metrics.log_metrics
def handler(event, context):
    return process_partial_response(event, _process_one, processor, context)
