locals {
  metric_namespace = "LiveAuction"
  alarm_actions    = [aws_sns_topic.alarms.arn]

  lambda_functions = {
    bid_processor     = "${var.name_prefix}-bid-processor"
    ws_authorizer     = "${var.name_prefix}-ws-authorizer"
    ws_handler        = "${var.name_prefix}-ws-handler"
    broadcast         = "${var.name_prefix}-broadcast"
    session_service   = "${var.name_prefix}-session-service"
    item_service      = "${var.name_prefix}-item-service"
    query_service     = "${var.name_prefix}-query-service"
    admin_command     = "${var.name_prefix}-admin-command"
    cognito_post_conf = "${var.name_prefix}-cognito-post-confirm"
  }

  queue_names = {
    bid_dlq       = "${var.name_prefix}-bid-commands-dlq.fifo"
    scheduler_dlq = "${var.name_prefix}-scheduler-dlq"
  }
}

resource "aws_sns_topic" "alarms" {
  name = "${var.name_prefix}-alarms"
}

resource "aws_sns_topic_subscription" "email" {
  count = var.sns_alarm_email == "" ? 0 : 1

  topic_arn = aws_sns_topic.alarms.arn
  protocol  = "email"
  endpoint  = var.sns_alarm_email
}

resource "aws_cloudwatch_metric_alarm" "rejected_bid" {
  alarm_name          = "${var.name_prefix}-rejected-bids"
  alarm_description   = "Rejected bids exceeded the operator threshold."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "RejectedBid"
  namespace           = local.metric_namespace
  period              = var.alarm_period_seconds
  statistic           = "Sum"
  threshold           = var.rejected_bid_threshold
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "bid_latency" {
  alarm_name          = "${var.name_prefix}-bid-latency-p95"
  alarm_description   = "Bid processing p95 latency exceeded the operator threshold."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  extended_statistic  = "p95"
  metric_name         = "BidLatency"
  namespace           = local.metric_namespace
  period              = var.alarm_period_seconds
  threshold           = var.bid_latency_p95_threshold_ms
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  for_each = local.lambda_functions

  alarm_name          = "${var.name_prefix}-${replace(each.key, "_", "-")}-errors"
  alarm_description   = "Unhandled errors for ${each.value}."
  comparison_operator = "GreaterThanThreshold"
  dimensions          = { FunctionName = each.value }
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = var.alarm_period_seconds
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "bid_dlq" {
  alarm_name          = "${var.name_prefix}-bid-dlq-visible"
  alarm_description   = "Messages are waiting in the bid command DLQ."
  comparison_operator = "GreaterThanThreshold"
  dimensions          = { QueueName = local.queue_names.bid_dlq }
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = var.alarm_period_seconds
  statistic           = "Maximum"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "scheduler_dlq" {
  alarm_name          = "${var.name_prefix}-scheduler-dlq-visible"
  alarm_description   = "Messages are waiting in the scheduler DLQ."
  comparison_operator = "GreaterThanThreshold"
  dimensions          = { QueueName = local.queue_names.scheduler_dlq }
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = var.alarm_period_seconds
  statistic           = "Maximum"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
}

resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${var.name_prefix}-operations"

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        width  = 12
        height = 6
        properties = {
          title  = "Bid health"
          region = var.aws_region
          period = var.alarm_period_seconds
          stat   = "Sum"
          metrics = [
            [local.metric_namespace, "AcceptedBid", { label = "Accepted bids" }],
            [".", "RejectedBid", { label = "Rejected bids" }],
          ]
        }
      },
      {
        type   = "metric"
        width  = 12
        height = 6
        properties = {
          title  = "Bid latency and DLQs"
          region = var.aws_region
          period = var.alarm_period_seconds
          metrics = [
            [local.metric_namespace, "BidLatency", { label = "Bid latency p95", stat = "p95" }],
            ["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", local.queue_names.bid_dlq, { label = "Bid DLQ" }],
            [".", ".", "QueueName", local.queue_names.scheduler_dlq, { label = "Scheduler DLQ" }],
          ]
        }
      }
    ]
  })
}
