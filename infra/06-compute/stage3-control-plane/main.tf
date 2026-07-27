data "terraform_remote_state" "data" {
  backend = "s3"

  config = {
    bucket         = "la-tfstate-233376973052"
    key            = "04-data/terraform.tfstate"
    region         = "ap-southeast-1"
    profile        = "la-admin"
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
    profile        = "la-admin"
    dynamodb_table = "la-tflock"
    encrypt        = true
  }
}

data "aws_partition" "current" {}

data "aws_caller_identity" "current" {
  lifecycle {
    postcondition {
      condition     = self.account_id == "233376973052" && self.arn == "arn:aws:iam::233376973052:user/la-admin"
      error_message = "Stage 3 requires AWS account 233376973052 and caller ARN arn:aws:iam::233376973052:user/la-admin."
    }
  }
}

locals {
  metrics_ns = "LiveAuction"

  stage3_functions = {
    session_service = "${var.name_prefix}-session-service"
    item_service    = "${var.name_prefix}-item-service"
    query_service   = "${var.name_prefix}-query-service"
    admin_command   = "${var.name_prefix}-admin-command"
  }

  stage3_archives = {
    session_service = "${path.module}/../../../backend/build/session_service.zip"
    item_service    = "${path.module}/../../../backend/build/item_service.zip"
    query_service   = "${path.module}/../../../backend/build/query_service.zip"
    admin_command   = "${path.module}/../../../backend/build/admin_command.zip"
  }

  stage3_admin_function_arn = "arn:${data.aws_partition.current.partition}:lambda:${var.aws_region}:${data.aws_caller_identity.current.account_id}:function:${local.stage3_functions.admin_command}"
  stage3_schedule_resource_arn = (
    var.enable_stage3 ?
    "arn:${data.aws_partition.current.partition}:scheduler:${var.aws_region}:${data.aws_caller_identity.current.account_id}:schedule/${data.terraform_remote_state.messaging.outputs.scheduler_group_name}/*" :
    null
  )
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

resource "aws_lambda_layer_version" "stage3_common" {
  count = var.enable_stage3 ? 1 : 0

  layer_name               = "${var.name_prefix}-stage3-common"
  description              = "Shared Stage 3 control-plane Python dependencies"
  filename                 = "${path.module}/../../../backend/build/layer.zip"
  source_code_hash         = filebase64sha256("${path.module}/../../../backend/build/layer.zip")
  compatible_runtimes      = ["python3.13"]
  compatible_architectures = ["x86_64"]
}

resource "aws_iam_role" "session_service" {
  count = var.enable_stage3 ? 1 : 0

  name               = "${substr(local.stage3_functions.session_service, 0, 59)}-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

data "aws_iam_policy_document" "session_service" {
  count = var.enable_stage3 ? 1 : 0

  statement {
    sid    = "WriteFunctionLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["${aws_cloudwatch_log_group.session_service[0].arn}:*"]
  }

  statement {
    sid    = "ManageCatalog"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
    ]
    resources = [data.terraform_remote_state.data.outputs.auction_catalog_table_arn]
  }
}

resource "aws_iam_role_policy" "session_service" {
  count = var.enable_stage3 ? 1 : 0

  name   = "${local.stage3_functions.session_service}-policy"
  role   = aws_iam_role.session_service[0].id
  policy = data.aws_iam_policy_document.session_service[0].json
}

resource "aws_cloudwatch_log_group" "session_service" {
  count = var.enable_stage3 ? 1 : 0

  name              = "/aws/lambda/${local.stage3_functions.session_service}"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "session_service" {
  count = var.enable_stage3 ? 1 : 0

  function_name = local.stage3_functions.session_service
  role          = aws_iam_role.session_service[0].arn
  runtime       = "python3.13"
  architectures = ["x86_64"]
  handler       = "handler.handler"

  filename         = local.stage3_archives.session_service
  source_code_hash = filebase64sha256(local.stage3_archives.session_service)
  layers           = [aws_lambda_layer_version.stage3_common[0].arn]

  memory_size = 512
  timeout     = 30

  environment {
    variables = {
      TBL_AUCTION_CATALOG     = data.terraform_remote_state.data.outputs.auction_catalog_table_name
      TBL_ITEM_STATE          = data.terraform_remote_state.data.outputs.item_state_table_name
      TBL_BID_EVENTS          = data.terraform_remote_state.data.outputs.bid_events_table_name
      CORS_ALLOWED_ORIGIN     = var.stage3_cors_allowed_origin
      POWERTOOLS_SERVICE_NAME = "session-service"
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.session_service[0],
    aws_iam_role_policy.session_service[0],
  ]
}

resource "aws_iam_role" "item_service" {
  count = var.enable_stage3 ? 1 : 0

  name               = "${substr(local.stage3_functions.item_service, 0, 59)}-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

data "aws_iam_policy_document" "item_service" {
  count = var.enable_stage3 ? 1 : 0

  statement {
    sid    = "WriteFunctionLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["${aws_cloudwatch_log_group.item_service[0].arn}:*"]
  }

  statement {
    sid    = "ManageCatalogItems"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:ConditionCheckItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
    ]
    resources = [data.terraform_remote_state.data.outputs.auction_catalog_table_arn]
  }

  statement {
    sid       = "ManageItemMedia"
    effect    = "Allow"
    actions   = ["s3:PutObject"]
    resources = ["${data.terraform_remote_state.data.outputs.media_bucket_arn}/items/*"]
  }
}

resource "aws_iam_role_policy" "item_service" {
  count = var.enable_stage3 ? 1 : 0

  name   = "${local.stage3_functions.item_service}-policy"
  role   = aws_iam_role.item_service[0].id
  policy = data.aws_iam_policy_document.item_service[0].json
}

resource "aws_cloudwatch_log_group" "item_service" {
  count = var.enable_stage3 ? 1 : 0

  name              = "/aws/lambda/${local.stage3_functions.item_service}"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "item_service" {
  count = var.enable_stage3 ? 1 : 0

  function_name = local.stage3_functions.item_service
  role          = aws_iam_role.item_service[0].arn
  runtime       = "python3.13"
  architectures = ["x86_64"]
  handler       = "handler.handler"

  filename         = local.stage3_archives.item_service
  source_code_hash = filebase64sha256(local.stage3_archives.item_service)
  layers           = [aws_lambda_layer_version.stage3_common[0].arn]

  memory_size = 512
  timeout     = 30

  environment {
    variables = {
      TBL_AUCTION_CATALOG     = data.terraform_remote_state.data.outputs.auction_catalog_table_name
      TBL_ITEM_STATE          = data.terraform_remote_state.data.outputs.item_state_table_name
      TBL_BID_EVENTS          = data.terraform_remote_state.data.outputs.bid_events_table_name
      CORS_ALLOWED_ORIGIN     = var.stage3_cors_allowed_origin
      MEDIA_BUCKET            = data.terraform_remote_state.data.outputs.media_bucket_name
      MAX_MEDIA_BYTES         = tostring(var.max_media_bytes)
      POWERTOOLS_SERVICE_NAME = "item-service"
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.item_service[0],
    aws_iam_role_policy.item_service[0],
  ]
}

resource "aws_iam_role" "query_service" {
  count = var.enable_stage3 ? 1 : 0

  name               = "${substr(local.stage3_functions.query_service, 0, 59)}-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

data "aws_iam_policy_document" "query_service" {
  count = var.enable_stage3 ? 1 : 0

  statement {
    sid    = "WriteFunctionLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["${aws_cloudwatch_log_group.query_service[0].arn}:*"]
  }

  statement {
    sid     = "ReadControlPlaneItems"
    effect  = "Allow"
    actions = ["dynamodb:GetItem"]
    resources = [
      data.terraform_remote_state.data.outputs.auction_catalog_table_arn,
      data.terraform_remote_state.data.outputs.item_state_table_arn,
    ]
  }

  statement {
    sid     = "QueryCatalogRecords"
    effect  = "Allow"
    actions = ["dynamodb:Query"]
    resources = [
      data.terraform_remote_state.data.outputs.auction_catalog_table_arn,
      "${data.terraform_remote_state.data.outputs.auction_catalog_table_arn}/index/gsi1",
      "${data.terraform_remote_state.data.outputs.auction_catalog_table_arn}/index/gsi2",
    ]
  }

  statement {
    sid     = "QueryBidderEvents"
    effect  = "Allow"
    actions = ["dynamodb:Query"]
    resources = [
      "${data.terraform_remote_state.data.outputs.bid_events_table_arn}/index/${data.terraform_remote_state.data.outputs.bidder_events_index_name}",
    ]
  }
}

resource "aws_iam_role_policy" "query_service" {
  count = var.enable_stage3 ? 1 : 0

  name   = "${local.stage3_functions.query_service}-policy"
  role   = aws_iam_role.query_service[0].id
  policy = data.aws_iam_policy_document.query_service[0].json
}

resource "aws_cloudwatch_log_group" "query_service" {
  count = var.enable_stage3 ? 1 : 0

  name              = "/aws/lambda/${local.stage3_functions.query_service}"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "query_service" {
  count = var.enable_stage3 ? 1 : 0

  function_name = local.stage3_functions.query_service
  role          = aws_iam_role.query_service[0].arn
  runtime       = "python3.13"
  architectures = ["x86_64"]
  handler       = "handler.handler"

  filename         = local.stage3_archives.query_service
  source_code_hash = filebase64sha256(local.stage3_archives.query_service)
  layers           = [aws_lambda_layer_version.stage3_common[0].arn]

  memory_size = 512
  timeout     = 30

  environment {
    variables = {
      TBL_AUCTION_CATALOG     = data.terraform_remote_state.data.outputs.auction_catalog_table_name
      TBL_ITEM_STATE          = data.terraform_remote_state.data.outputs.item_state_table_name
      TBL_BID_EVENTS          = data.terraform_remote_state.data.outputs.bid_events_table_name
      CORS_ALLOWED_ORIGIN     = var.stage3_cors_allowed_origin
      POWERTOOLS_SERVICE_NAME = "query-service"
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.query_service[0],
    aws_iam_role_policy.query_service[0],
  ]
}

resource "aws_iam_role" "admin_command" {
  count = var.enable_stage3 ? 1 : 0

  name               = "${substr(local.stage3_functions.admin_command, 0, 59)}-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

data "aws_iam_policy_document" "admin_command" {
  count = var.enable_stage3 ? 1 : 0

  statement {
    sid    = "WriteFunctionLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["${aws_cloudwatch_log_group.admin_command[0].arn}:*"]
  }

  statement {
    sid    = "ManageCatalogItems"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:UpdateItem",
    ]
    resources = [data.terraform_remote_state.data.outputs.auction_catalog_table_arn]
  }

  statement {
    sid    = "ManageAuctionState"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
    ]
    resources = [data.terraform_remote_state.data.outputs.item_state_table_arn]
  }

  statement {
    sid       = "WriteBidEvents"
    effect    = "Allow"
    actions   = ["dynamodb:PutItem"]
    resources = [data.terraform_remote_state.data.outputs.bid_events_table_arn]
  }

  statement {
    sid     = "QueryCatalogRecords"
    effect  = "Allow"
    actions = ["dynamodb:Query"]
    resources = [
      data.terraform_remote_state.data.outputs.auction_catalog_table_arn,
      "${data.terraform_remote_state.data.outputs.auction_catalog_table_arn}/index/gsi2",
    ]
  }

  statement {
    sid    = "ManageSchedules"
    effect = "Allow"
    actions = [
      "scheduler:GetSchedule",
      "scheduler:CreateSchedule",
      "scheduler:DeleteSchedule",
    ]
    resources = [local.stage3_schedule_resource_arn]
  }

  statement {
    sid       = "PassSchedulerRole"
    effect    = "Allow"
    actions   = ["iam:PassRole"]
    resources = [data.terraform_remote_state.messaging.outputs.scheduler_role_arn]

    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["scheduler.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy" "admin_command" {
  count = var.enable_stage3 ? 1 : 0

  name   = "${local.stage3_functions.admin_command}-policy"
  role   = aws_iam_role.admin_command[0].id
  policy = data.aws_iam_policy_document.admin_command[0].json
}

resource "aws_cloudwatch_log_group" "admin_command" {
  count = var.enable_stage3 ? 1 : 0

  name              = "/aws/lambda/${local.stage3_functions.admin_command}"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "admin_command" {
  count = var.enable_stage3 ? 1 : 0

  function_name = local.stage3_functions.admin_command
  role          = aws_iam_role.admin_command[0].arn
  runtime       = "python3.13"
  architectures = ["x86_64"]
  handler       = "handler.handler"

  filename         = local.stage3_archives.admin_command
  source_code_hash = filebase64sha256(local.stage3_archives.admin_command)
  layers           = [aws_lambda_layer_version.stage3_common[0].arn]

  memory_size = 512
  timeout     = 60

  environment {
    variables = {
      OWNER_REGION                 = var.aws_region
      TBL_AUCTION_CATALOG          = data.terraform_remote_state.data.outputs.auction_catalog_table_name
      TBL_ITEM_STATE               = data.terraform_remote_state.data.outputs.item_state_table_name
      TBL_BID_EVENTS               = data.terraform_remote_state.data.outputs.bid_events_table_name
      CORS_ALLOWED_ORIGIN          = var.stage3_cors_allowed_origin
      SCHEDULER_GROUP              = data.terraform_remote_state.messaging.outputs.scheduler_group_name
      SCHEDULER_ROLE_ARN           = data.terraform_remote_state.messaging.outputs.scheduler_role_arn
      SCHEDULER_DLQ_ARN            = data.terraform_remote_state.messaging.outputs.scheduler_dlq_arn
      ADMIN_COMMAND_ARN            = local.stage3_admin_function_arn
      POWERTOOLS_SERVICE_NAME      = "admin-command"
      POWERTOOLS_METRICS_NAMESPACE = local.metrics_ns
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.admin_command[0],
    aws_iam_role_policy.admin_command[0],
  ]
}

resource "aws_lambda_permission" "admin_scheduler" {
  count = var.enable_stage3 ? 1 : 0

  statement_id   = "AllowSchedulerInvoke"
  action         = "lambda:InvokeFunction"
  function_name  = aws_lambda_function.admin_command[0].function_name
  principal      = "scheduler.amazonaws.com"
  source_account = data.aws_caller_identity.current.account_id
  source_arn     = data.terraform_remote_state.messaging.outputs.scheduler_group_arn
}

resource "aws_scheduler_schedule" "lifecycle_watchdog" {
  count = var.enable_stage3 ? 1 : 0

  name                = "${var.name_prefix}-lifecycle-watchdog"
  group_name          = data.terraform_remote_state.messaging.outputs.scheduler_group_name
  schedule_expression = "rate(1 minute)"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_lambda_function.admin_command[0].arn
    role_arn = data.terraform_remote_state.messaging.outputs.scheduler_role_arn
    input    = jsonencode({ command = "WATCHDOG_SWEEP" })

    dead_letter_config {
      arn = data.terraform_remote_state.messaging.outputs.scheduler_dlq_arn
    }

    retry_policy {
      maximum_event_age_in_seconds = 3600
      maximum_retry_attempts       = 3
    }
  }

  depends_on = [
    aws_lambda_function.admin_command[0],
    aws_lambda_permission.admin_scheduler[0],
  ]
}
