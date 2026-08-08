locals {
  queue_names = {
    bid_commands = "${var.name_prefix}-bid-commands.fifo"
    bid_dlq      = "${var.name_prefix}-bid-commands-dlq.fifo"
  }

  scheduler_group_name = "${substr(replace(var.name_prefix, "/[^0-9A-Za-z_.-]/", "-"), 0, 54)}-scheduler"
  admin_function_arn = (
    var.enable_stage3 ?
    "arn:${data.aws_partition.current[0].partition}:lambda:${var.aws_region}:${data.aws_caller_identity.current[0].account_id}:function:${var.name_prefix}-admin-command" :
    null
  )
  scheduler_group_arn = (
    var.enable_stage3 ?
    "arn:${data.aws_partition.current[0].partition}:scheduler:${var.aws_region}:${data.aws_caller_identity.current[0].account_id}:schedule-group/${local.scheduler_group_name}" :
    null
  )
}

data "aws_caller_identity" "current" {
  count = var.enable_stage3 ? 1 : 0
}

data "aws_partition" "current" {
  count = var.enable_stage3 ? 1 : 0
}

resource "aws_sqs_queue" "bid_dlq" {
  name                      = local.queue_names.bid_dlq
  fifo_queue                = true
  message_retention_seconds = var.dlq_message_retention_seconds
  sqs_managed_sse_enabled   = true
}

resource "aws_sqs_queue" "bid_commands" {
  name                        = local.queue_names.bid_commands
  fifo_queue                  = true
  content_based_deduplication = false
  deduplication_scope         = "messageGroup"
  fifo_throughput_limit       = "perMessageGroupId"
  message_retention_seconds   = var.message_retention_seconds
  visibility_timeout_seconds  = var.visibility_timeout_seconds
  sqs_managed_sse_enabled     = true

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.bid_dlq.arn
    maxReceiveCount     = var.max_receive_count
  })
}

resource "aws_scheduler_schedule_group" "main" {
  count = var.enable_stage3 ? 1 : 0

  name = local.scheduler_group_name
}

resource "aws_sqs_queue" "scheduler_dlq" {
  count = var.enable_stage3 ? 1 : 0

  name                      = "${var.name_prefix}-scheduler-dlq"
  message_retention_seconds = var.scheduler_dlq_retention_seconds
  sqs_managed_sse_enabled   = true
}

resource "aws_iam_role" "scheduler_invoke" {
  count = var.enable_stage3 ? 1 : 0

  name = "${var.name_prefix}-scheduler-invoke"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = "sts:AssumeRole"
      Principal = {
        Service = "scheduler.amazonaws.com"
      }
      Condition = {
        StringEquals = {
          "aws:SourceAccount" = data.aws_caller_identity.current[0].account_id
          "aws:SourceArn"     = local.scheduler_group_arn
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "scheduler_invoke" {
  count = var.enable_stage3 ? 1 : 0

  name = "${var.name_prefix}-scheduler-invoke"
  role = aws_iam_role.scheduler_invoke[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "InvokeAdminCommand"
        Effect   = "Allow"
        Action   = ["lambda:InvokeFunction"]
        Resource = [local.admin_function_arn]
      },
      {
        Sid      = "SendToSchedulerDlq"
        Effect   = "Allow"
        Action   = ["sqs:SendMessage"]
        Resource = [aws_sqs_queue.scheduler_dlq[0].arn]
      }
    ]
  })
}
