data "terraform_remote_state" "data" {
  backend = "s3"

  config = {
    bucket         = "la-tfstate-233376973052"
    key            = "04-data/terraform.tfstate"
    region         = "ap-southeast-1"
    dynamodb_table = "la-tflock"
    encrypt        = true
  }
}

data "terraform_remote_state" "messaging" {
  backend = "s3"

  config = {
    bucket         = "la-tfstate-233376973052"
    key            = "05-messaging/terraform.tfstate"
    region         = "ap-southeast-1"
    dynamodb_table = "la-tflock"
    encrypt        = true
  }
}

data "terraform_remote_state" "identity" {
  backend = "s3"

  config = {
    bucket         = "la-tfstate-233376973052"
    key            = "03-identity/terraform.tfstate"
    region         = "ap-southeast-1"
    dynamodb_table = "la-tflock"
    encrypt        = true
  }
}

data "aws_partition" "current" {}

data "aws_caller_identity" "current" {}

locals {
  function_name = "${var.name_prefix}-bid-processor"
  role_name     = "${var.name_prefix}-bid-processor-role"
  log_group     = "/aws/lambda/${local.function_name}"
  metrics_ns    = "LiveAuction"

  layer_archive               = "${path.module}/../../backend/build/layer.zip"
  function_archive            = "${path.module}/../../backend/build/bid_processor.zip"
  ws_authorizer               = "${var.name_prefix}-ws-authorizer"
  ws_authorizer_function_name = local.ws_authorizer
  ws_authorizer_role_name     = "${local.ws_authorizer}-role"
  ws_authorizer_log_group     = "/aws/lambda/${local.ws_authorizer}"
  ws_authorizer_archive       = "${path.module}/../../backend/build/ws_authorizer.zip"
  ws_handler                  = "${var.name_prefix}-ws-handler"
  ws_handler_function_name    = local.ws_handler
  ws_handler_role_name        = "${local.ws_handler}-role"
  ws_handler_log_group        = "/aws/lambda/${local.ws_handler}"
  ws_handler_archive          = "${path.module}/../../backend/build/ws_handler.zip"
  broadcast                   = "${var.name_prefix}-broadcast"
  broadcast_function_name     = local.broadcast
  broadcast_role_name         = "${local.broadcast}-role"
  broadcast_log_group         = "/aws/lambda/${local.broadcast}"
  broadcast_archive           = "${path.module}/../../backend/build/broadcast.zip"
  ws_authorizer_function_arn  = "arn:${data.aws_partition.current.partition}:lambda:${var.aws_region}:${data.aws_caller_identity.current.account_id}:function:${local.ws_authorizer_function_name}"
  ws_handler_function_arn     = "arn:${data.aws_partition.current.partition}:lambda:${var.aws_region}:${data.aws_caller_identity.current.account_id}:function:${local.ws_handler_function_name}"
  broadcast_function_arn      = "arn:${data.aws_partition.current.partition}:lambda:${var.aws_region}:${data.aws_caller_identity.current.account_id}:function:${local.broadcast_function_name}"
  ws_manage_connections_arn   = "arn:${data.aws_partition.current.partition}:execute-api:${var.aws_region}:${data.aws_caller_identity.current.account_id}:*/*/POST/@connections/*"
}

data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "bid_processor" {
  name               = local.role_name
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

data "aws_iam_policy_document" "bid_processor" {
  statement {
    sid    = "WriteFunctionLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["${aws_cloudwatch_log_group.bid_processor.arn}:*"]
  }

  statement {
    sid    = "ConsumeBidCommands"
    effect = "Allow"
    actions = [
      "sqs:ReceiveMessage",
      "sqs:DeleteMessage",
      "sqs:GetQueueAttributes",
    ]
    resources = [data.terraform_remote_state.messaging.outputs.bid_commands_queue_arn]
  }

  statement {
    sid    = "ReadAndUpdateAuctionState"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:UpdateItem",
    ]
    resources = [data.terraform_remote_state.data.outputs.item_state_table_arn]
  }

  statement {
    sid    = "QueryAndWriteBidAudit"
    effect = "Allow"
    actions = [
      "dynamodb:Query",
      "dynamodb:PutItem",
    ]
    resources = [data.terraform_remote_state.data.outputs.bid_events_table_arn]
  }

  statement {
    sid    = "UseIdempotencyRecords"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
    ]
    resources = [data.terraform_remote_state.data.outputs.idempotency_table_arn]
  }

  statement {
    sid       = "PublishApplicationMetrics"
    effect    = "Allow"
    actions   = ["cloudwatch:PutMetricData"]
    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "cloudwatch:namespace"
      values   = [local.metrics_ns]
    }
  }

  statement {
    sid       = "InvokeBroadcast"
    effect    = "Allow"
    actions   = ["lambda:InvokeFunction"]
    resources = [local.broadcast_function_arn]
  }
}

resource "aws_iam_role_policy" "bid_processor" {
  name   = "${local.role_name}-policy"
  role   = aws_iam_role.bid_processor.id
  policy = data.aws_iam_policy_document.bid_processor.json
}

resource "aws_cloudwatch_log_group" "bid_processor" {
  name              = local.log_group
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_layer_version" "common" {
  layer_name               = "${var.name_prefix}-common"
  description              = "Shared Live Auction Python dependencies"
  filename                 = "${path.module}/../../backend/build/layer.zip"
  source_code_hash         = filebase64sha256(local.layer_archive)
  compatible_runtimes      = ["python3.13"]
  compatible_architectures = ["x86_64"]
}

resource "aws_lambda_function" "bid_processor" {
  function_name = local.function_name
  description   = "Consumes FIFO bid commands and atomically updates auction state"
  role          = aws_iam_role.bid_processor.arn
  runtime       = "python3.13"
  architectures = ["x86_64"]
  handler       = "handler.handler"

  filename         = local.function_archive
  source_code_hash = filebase64sha256(local.function_archive)
  layers           = [aws_lambda_layer_version.common.arn]

  timeout     = var.lambda_timeout_seconds
  memory_size = var.lambda_memory_size

  environment {
    variables = {
      OWNER_REGION                 = var.aws_region
      TBL_ITEM_STATE               = data.terraform_remote_state.data.outputs.item_state_table_name
      TBL_BID_EVENTS               = data.terraform_remote_state.data.outputs.bid_events_table_name
      TBL_IDEMPOTENCY              = data.terraform_remote_state.data.outputs.idempotency_table_name
      BID_QUEUE_URL                = data.terraform_remote_state.messaging.outputs.bid_commands_queue_url
      BROADCAST_FN_NAME            = var.enable_broadcast ? local.broadcast_function_name : ""
      POWERTOOLS_SERVICE_NAME      = "bid-processor"
      POWERTOOLS_METRICS_NAMESPACE = local.metrics_ns
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.bid_processor,
    aws_iam_role_policy.bid_processor,
  ]
}

resource "aws_lambda_event_source_mapping" "bid" {
  event_source_arn        = data.terraform_remote_state.messaging.outputs.bid_commands_queue_arn
  function_name           = aws_lambda_function.bid_processor.arn
  enabled                 = true
  batch_size              = 10
  function_response_types = ["ReportBatchItemFailures"]

  scaling_config {
    maximum_concurrency = 10
  }
}

resource "aws_iam_role" "ws_authorizer" {
  name               = local.ws_authorizer_role_name
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

data "aws_iam_policy_document" "ws_authorizer" {
  statement {
    sid    = "WriteFunctionLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["${aws_cloudwatch_log_group.ws_authorizer.arn}:*"]
  }
}

resource "aws_iam_role_policy" "ws_authorizer" {
  name   = "${local.ws_authorizer_role_name}-policy"
  role   = aws_iam_role.ws_authorizer.id
  policy = data.aws_iam_policy_document.ws_authorizer.json
}

resource "aws_cloudwatch_log_group" "ws_authorizer" {
  name              = local.ws_authorizer_log_group
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "ws_authorizer" {
  function_name = local.ws_authorizer_function_name
  description   = "Validates Cognito JWTs for WebSocket connections"
  role          = aws_iam_role.ws_authorizer.arn
  runtime       = "python3.13"
  architectures = ["x86_64"]
  handler       = "handler.handler"

  filename         = local.ws_authorizer_archive
  source_code_hash = filebase64sha256(local.ws_authorizer_archive)
  layers           = [aws_lambda_layer_version.common.arn]

  timeout     = var.lambda_timeout_seconds
  memory_size = var.lambda_memory_size

  environment {
    variables = {
      COGNITO_JWKS_URL        = data.terraform_remote_state.identity.outputs.cognito_jwks_url
      COGNITO_ISSUER          = data.terraform_remote_state.identity.outputs.cognito_issuer
      COGNITO_CLIENT_ID       = data.terraform_remote_state.identity.outputs.cognito_client_id
      POWERTOOLS_SERVICE_NAME = "ws-authorizer"
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.ws_authorizer,
    aws_iam_role_policy.ws_authorizer,
  ]
}

resource "aws_iam_role" "ws_handler" {
  name               = local.ws_handler_role_name
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

data "aws_iam_policy_document" "ws_handler" {
  statement {
    sid    = "WriteFunctionLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["${aws_cloudwatch_log_group.ws_handler.arn}:*"]
  }

  statement {
    sid    = "ManageConnectionRecords"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:DeleteItem",
      "dynamodb:UpdateItem",
      "dynamodb:TransactWriteItems",
    ]
    resources = [data.terraform_remote_state.data.outputs.websocket_connections_table_arn]
  }

  statement {
    sid    = "ManageBidderAliases"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
    ]
    resources = [data.terraform_remote_state.data.outputs.bidder_aliases_table_arn]
  }

  statement {
    sid       = "ReadAuctionState"
    effect    = "Allow"
    actions   = ["dynamodb:GetItem"]
    resources = [data.terraform_remote_state.data.outputs.item_state_table_arn]
  }

  statement {
    sid       = "EnqueueBidCommands"
    effect    = "Allow"
    actions   = ["sqs:SendMessage"]
    resources = [data.terraform_remote_state.messaging.outputs.bid_commands_queue_arn]
  }

  statement {
    sid       = "ManageWebSocketConnections"
    effect    = "Allow"
    actions   = ["execute-api:ManageConnections"]
    resources = [local.ws_manage_connections_arn]
  }
}

resource "aws_iam_role_policy" "ws_handler" {
  name   = "${local.ws_handler_role_name}-policy"
  role   = aws_iam_role.ws_handler.id
  policy = data.aws_iam_policy_document.ws_handler.json
}

resource "aws_cloudwatch_log_group" "ws_handler" {
  name              = local.ws_handler_log_group
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "ws_handler" {
  function_name = local.ws_handler_function_name
  description   = "Handles WebSocket lifecycle, room membership, and bid commands"
  role          = aws_iam_role.ws_handler.arn
  runtime       = "python3.13"
  architectures = ["x86_64"]
  handler       = "handler.handler"

  filename         = local.ws_handler_archive
  source_code_hash = filebase64sha256(local.ws_handler_archive)
  layers           = [aws_lambda_layer_version.common.arn]

  timeout     = var.lambda_timeout_seconds
  memory_size = var.lambda_memory_size

  environment {
    variables = {
      OWNER_REGION            = var.aws_region
      TBL_ITEM_STATE          = data.terraform_remote_state.data.outputs.item_state_table_name
      TBL_BID_EVENTS          = data.terraform_remote_state.data.outputs.bid_events_table_name
      TBL_WS_CONN             = data.terraform_remote_state.data.outputs.websocket_connections_table_name
      TBL_ALIASES             = data.terraform_remote_state.data.outputs.bidder_aliases_table_name
      BID_QUEUE_URL           = data.terraform_remote_state.messaging.outputs.bid_commands_queue_url
      WS_MGMT_ENDPOINT        = var.ws_management_endpoint
      POWERTOOLS_SERVICE_NAME = "ws-handler"
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.ws_handler,
    aws_iam_role_policy.ws_handler,
  ]
}

resource "aws_iam_role" "broadcast" {
  name               = local.broadcast_role_name
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

data "aws_iam_policy_document" "broadcast" {
  statement {
    sid    = "WriteFunctionLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["${aws_cloudwatch_log_group.broadcast.arn}:*"]
  }

  statement {
    sid    = "ReadAndCleanRoomConnections"
    effect = "Allow"
    actions = [
      "dynamodb:Query",
      "dynamodb:DeleteItem",
    ]
    resources = [data.terraform_remote_state.data.outputs.websocket_connections_table_arn]
  }

  statement {
    sid       = "ManageWebSocketConnections"
    effect    = "Allow"
    actions   = ["execute-api:ManageConnections"]
    resources = [local.ws_manage_connections_arn]
  }
}

resource "aws_iam_role_policy" "broadcast" {
  name   = "${local.broadcast_role_name}-policy"
  role   = aws_iam_role.broadcast.id
  policy = data.aws_iam_policy_document.broadcast.json
}

resource "aws_cloudwatch_log_group" "broadcast" {
  name              = local.broadcast_log_group
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "broadcast" {
  function_name = local.broadcast_function_name
  description   = "Fans bid outcomes out to WebSocket clients"
  role          = aws_iam_role.broadcast.arn
  runtime       = "python3.13"
  architectures = ["x86_64"]
  handler       = "handler.handler"

  filename         = local.broadcast_archive
  source_code_hash = filebase64sha256(local.broadcast_archive)
  layers           = [aws_lambda_layer_version.common.arn]

  timeout     = var.lambda_timeout_seconds
  memory_size = var.lambda_memory_size

  environment {
    variables = {
      OWNER_REGION            = var.aws_region
      TBL_ITEM_STATE          = data.terraform_remote_state.data.outputs.item_state_table_name
      TBL_BID_EVENTS          = data.terraform_remote_state.data.outputs.bid_events_table_name
      TBL_WS_CONN             = data.terraform_remote_state.data.outputs.websocket_connections_table_name
      WS_MGMT_ENDPOINT        = var.ws_management_endpoint
      POWERTOOLS_SERVICE_NAME = "broadcast"
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.broadcast,
    aws_iam_role_policy.broadcast,
  ]
}
