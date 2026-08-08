data "aws_partition" "current" {}

data "aws_caller_identity" "current" {}

locals {
  issuer                  = "https://${aws_cognito_user_pool.main.endpoint}"
  jwks_url                = "${local.issuer}/.well-known/jwks.json"
  cognito_user_pool_scope = "arn:${data.aws_partition.current.partition}:cognito-idp:${var.aws_region}:${data.aws_caller_identity.current.account_id}:userpool/*"
}

data "aws_iam_policy_document" "post_confirmation_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "post_confirmation" {
  statement {
    sid    = "WriteFunctionLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["${aws_cloudwatch_log_group.cognito_post_confirm.arn}:*"]
  }

  statement {
    sid       = "AssignUserGroup"
    effect    = "Allow"
    actions   = ["cognito-idp:AdminAddUserToGroup"]
    resources = [local.cognito_user_pool_scope]
  }
}

resource "aws_iam_role" "cognito_post_confirm" {
  name               = "${var.name_prefix}-cognito-post-confirmation-role"
  assume_role_policy = data.aws_iam_policy_document.post_confirmation_assume_role.json
}

resource "aws_iam_role_policy" "cognito_post_confirm" {
  name   = "${var.name_prefix}-cognito-post-confirmation-policy"
  role   = aws_iam_role.cognito_post_confirm.id
  policy = data.aws_iam_policy_document.post_confirmation.json
}

resource "aws_cloudwatch_log_group" "cognito_post_confirm" {
  name              = "/aws/lambda/${var.name_prefix}-cognito-post-confirmation"
  retention_in_days = 14
}

resource "aws_lambda_function" "cognito_post_confirm" {
  function_name = "${var.name_prefix}-cognito-post-confirm"
  role          = aws_iam_role.cognito_post_confirm.arn
  runtime       = "python3.13"
  architectures = ["x86_64"]
  handler       = "handler.handler"

  filename         = "${path.module}/../../backend/build/cognito_post_confirm.zip"
  source_code_hash = filebase64sha256("${path.module}/../../backend/build/cognito_post_confirm.zip")

  memory_size = 128
  timeout     = 10

  environment {
    variables = {
      USER_GROUP_NAME         = "USER"
      POWERTOOLS_SERVICE_NAME = "cognito-post-confirm"
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.cognito_post_confirm,
    aws_iam_role_policy.cognito_post_confirm,
  ]
}

resource "aws_lambda_permission" "cognito_post_confirm" {
  statement_id  = "AllowCognitoPostConfirmation"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.cognito_post_confirm.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.main.arn
}

resource "aws_cognito_user_pool" "main" {
  name                     = "${var.name_prefix}-users"
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]
  deletion_protection      = var.enable_cognito_deletion_protection ? "ACTIVE" : "INACTIVE"

  admin_create_user_config {
    allow_admin_create_user_only = false
  }

  lambda_config {
    post_confirmation = aws_lambda_function.cognito_post_confirm.arn
  }

  password_policy {
    minimum_length                   = 12
    require_lowercase                = true
    require_uppercase                = true
    require_numbers                  = true
    require_symbols                  = true
    temporary_password_validity_days = 7
  }

  user_attribute_update_settings {
    attributes_require_verification_before_update = ["email"]
  }
}

resource "aws_cognito_user_pool_client" "web" {
  name         = "${var.name_prefix}-web"
  user_pool_id = aws_cognito_user_pool.main.id

  generate_secret               = false
  prevent_user_existence_errors = "ENABLED"
  explicit_auth_flows = [
    "ALLOW_ADMIN_USER_PASSWORD_AUTH",
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]

  access_token_validity  = 1
  id_token_validity      = 1
  refresh_token_validity = 30

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }
}

resource "aws_cognito_user_group" "admin" {
  user_pool_id = aws_cognito_user_pool.main.id
  name         = "ADMIN"
  precedence   = 1
}

resource "aws_cognito_user_group" "user" {
  user_pool_id = aws_cognito_user_pool.main.id
  name         = "USER"
  precedence   = 2
}
