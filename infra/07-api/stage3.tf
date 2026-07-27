data "terraform_remote_state" "identity" {
  count   = var.enable_stage3 ? 1 : 0
  backend = "s3"

  config = {
    bucket         = "la-tfstate-233376973052"
    key            = "03-identity/terraform.tfstate"
    region         = "ap-southeast-1"
    dynamodb_table = "la-tflock"
    encrypt        = true
  }
}

data "terraform_remote_state" "stage3_compute" {
  count   = var.enable_stage3 ? 1 : 0
  backend = "s3"

  config = {
    bucket         = "la-tfstate-233376973052"
    key            = "06-compute/stage3-control-plane/terraform.tfstate"
    region         = "ap-southeast-1"
    dynamodb_table = "la-tflock"
    encrypt        = true
  }
}

locals {
  stage3_required_function_names = [
    "session_service",
    "item_service",
    "query_service",
    "admin_command",
  ]
  stage3_dependency_functions = (
    var.enable_stage3 ?
    try(data.terraform_remote_state.stage3_compute[0].outputs.stage3_functions, {}) :
    {}
  )
  stage3_function_names = (
    var.enable_stage3 ? {
      for name in local.stage3_required_function_names :
      name => try(lookup(local.stage3_dependency_functions, name, null).name, null)
    } : {}
  )
  stage3_function_invoke_arns = (
    var.enable_stage3 ? {
      for name in local.stage3_required_function_names :
      name => try(lookup(local.stage3_dependency_functions, name, null).invoke_arn, null)
    } : {}
  )
  stage3_cors_allowed_origin = (
    var.enable_stage3 ?
    try(data.terraform_remote_state.stage3_compute[0].outputs.stage3_cors_allowed_origin, null) :
    null
  )
  stage3_identity_user_pool_arn = (
    var.enable_stage3 ?
    try(data.terraform_remote_state.identity[0].outputs.cognito_user_pool_arn, null) :
    null
  )
  stage3_dependencies_ready = (
    !var.enable_stage3 || (
      length(setsubtract(
        toset(local.stage3_required_function_names),
        toset(keys(local.stage3_dependency_functions))
      )) == 0 &&
      length(setsubtract(
        toset(keys(local.stage3_dependency_functions)),
        toset(local.stage3_required_function_names)
      )) == 0 &&
      alltrue([
        for name in local.stage3_required_function_names :
        try(
          lookup(local.stage3_dependency_functions, name, null).name != null &&
          lookup(local.stage3_dependency_functions, name, null).invoke_arn != null,
          false
        )
      ]) &&
      local.stage3_cors_allowed_origin != null &&
      local.stage3_identity_user_pool_arn != null
    )
  )
  stage3_dependency_error = "Stage 3 requires compute outputs for exactly session_service, item_service, query_service, admin_command with non-null name and invoke ARN values, a non-null CORS origin, and a non-null Cognito user pool ARN."

  stage3_cors_allowed_headers = "Content-Type,Authorization,X-Api-Key"
  stage3_cors_allowed_methods = "GET,POST,PUT,OPTIONS"

  stage3_routes = {
    "/api/v1/auction-sessions"                       = { GET = "query_service", POST = "session_service" }
    "/api/v1/auction-sessions/mine"                  = { GET = "query_service" }
    "/api/v1/auction-sessions/{session_id}"          = { GET = "query_service" }
    "/api/v1/auction-sessions/{session_id}/rules"    = { PUT = "session_service" }
    "/api/v1/auction-sessions/{session_id}/items"    = { POST = "item_service" }
    "/api/v1/auction-sessions/{session_id}/schedule" = { POST = "admin_command" }
    "/api/v1/auction-items"                          = { GET = "query_service" }
    "/api/v1/auction-items/{item_id}"                = { GET = "query_service" }
    "/api/v1/auction-items/{item_id}/images/presign" = { POST = "item_service" }
    "/api/v1/bids/my"                                = { GET = "query_service" }
    "/api/v1/admin/items/{item_id}/pause"            = { POST = "admin_command" }
    "/api/v1/admin/items/{item_id}/resume"           = { POST = "admin_command" }
    "/api/v1/admin/items/{item_id}/approve"          = { POST = "admin_command" }
    "/api/v1/admin/items/{item_id}/close"            = { POST = "admin_command" }
    "/api/v1/admin/items/{item_id}/cancel"           = { POST = "admin_command" }
  }

  stage3_operations = flatten([
    for path, methods in local.stage3_routes : [
      for method, function_name in methods : {
        key           = "${method} ${path}"
        path          = path
        method        = lower(method)
        function_name = function_name
      }
    ]
  ])

  stage3_cache_paths = toset([
    "/api/v1/auction-sessions",
    "/api/v1/auction-items",
  ])

  stage3_cache_key_parameters = {
    "/api/v1/auction-sessions" = [
      "method.request.querystring.status",
      "method.request.querystring.pageSize",
      "method.request.querystring.cursor",
    ]
    "/api/v1/auction-items" = [
      "method.request.querystring.status",
      "method.request.querystring.pageSize",
      "method.request.querystring.cursor",
      "method.request.querystring.sessionId",
      "method.request.querystring.categoryId",
    ]
  }

  stage3_path_parameter_names = {
    "/api/v1/auction-sessions/{session_id}"          = ["session_id"]
    "/api/v1/auction-sessions/{session_id}/rules"    = ["session_id"]
    "/api/v1/auction-sessions/{session_id}/items"    = ["session_id"]
    "/api/v1/auction-sessions/{session_id}/schedule" = ["session_id"]
    "/api/v1/auction-items/{item_id}"                = ["item_id"]
    "/api/v1/auction-items/{item_id}/images/presign" = ["item_id"]
    "/api/v1/admin/items/{item_id}/pause"            = ["item_id"]
    "/api/v1/admin/items/{item_id}/resume"           = ["item_id"]
    "/api/v1/admin/items/{item_id}/approve"          = ["item_id"]
    "/api/v1/admin/items/{item_id}/close"            = ["item_id"]
    "/api/v1/admin/items/{item_id}/cancel"           = ["item_id"]
  }

  stage3_query_parameter_names = {
    "/api/v1/auction-sessions" = ["status", "pageSize", "cursor"]
    "/api/v1/auction-items" = [
      "status",
      "pageSize",
      "cursor",
      "sessionId",
      "categoryId",
    ]
  }

  stage3_options_operation = (var.enable_stage3 ? {
    responses = {
      "200" = {
        description = "CORS response"
        headers = {
          "Access-Control-Allow-Origin"  = { schema = { type = "string" } }
          "Access-Control-Allow-Headers" = { schema = { type = "string" } }
          "Access-Control-Allow-Methods" = { schema = { type = "string" } }
        }
      }
    }
    security = []
    "x-amazon-apigateway-integration" = {
      type                = "mock"
      passthroughBehavior = "WHEN_NO_MATCH"
      requestTemplates = {
        "application/json" = jsonencode({ statusCode = 200 })
      }
      responses = {
        default = {
          statusCode = "200"
          responseParameters = {
            "method.response.header.Access-Control-Allow-Origin"  = "'${coalesce(local.stage3_cors_allowed_origin, "")}'"
            "method.response.header.Access-Control-Allow-Headers" = "'${local.stage3_cors_allowed_headers}'"
            "method.response.header.Access-Control-Allow-Methods" = "'${local.stage3_cors_allowed_methods}'"
          }
        }
      }
    }
  } : null)

  stage3_openapi_paths = {
    for path, methods in local.stage3_routes : path => merge(
      {
        for method, function_name in methods : lower(method) => {
          parameters = concat(
            [
              for name in lookup(local.stage3_path_parameter_names, path, []) : {
                name     = name
                in       = "path"
                required = true
                schema   = { type = "string" }
              }
            ],
            [
              for name in lookup(local.stage3_query_parameter_names, path, []) : {
                name     = name
                in       = "query"
                required = false
                schema   = { type = "string" }
              }
            ]
          )
          responses = {
            default = { description = "Lambda proxy response" }
          }
          security = [{ cognito = [], api_key = [] }]
          "x-amazon-apigateway-integration" = {
            type               = "aws_proxy"
            httpMethod         = "POST"
            uri                = lookup(local.stage3_function_invoke_arns, function_name, null)
            cacheKeyParameters = lookup(local.stage3_cache_key_parameters, path, [])
          }
        }
      },
      { options = local.stage3_options_operation }
    ) if var.enable_stage3
  }

  stage3_openapi_document = (var.enable_stage3 ? {
    openapi = "3.0.1"
    info = {
      title   = "${var.name_prefix}-control-plane"
      version = "1.0"
    }
    paths = local.stage3_openapi_paths
    components = {
      securitySchemes = {
        cognito = {
          type                           = "apiKey"
          name                           = "Authorization"
          in                             = "header"
          "x-amazon-apigateway-authtype" = "cognito_user_pools"
          "x-amazon-apigateway-authorizer" = {
            type         = "cognito_user_pools"
            providerARNs = [local.stage3_identity_user_pool_arn]
          }
        }
        api_key = {
          type = "apiKey"
          name = "x-api-key"
          in   = "header"
        }
      }
    }
  } : null)

  stage3_gateway_cors_response_parameters = (var.enable_stage3 ? {
    "gatewayresponse.header.Access-Control-Allow-Origin"  = "'${coalesce(local.stage3_cors_allowed_origin, "")}'"
    "gatewayresponse.header.Access-Control-Allow-Headers" = "'${local.stage3_cors_allowed_headers}'"
    "gatewayresponse.header.Access-Control-Allow-Methods" = "'${local.stage3_cors_allowed_methods}'"
  } : null)

  stage3_access_log_format = jsonencode({
    requestId         = "$context.requestId"
    method            = "$context.httpMethod"
    route             = "$context.resourcePath"
    status            = "$context.status"
    latency           = "$context.responseLatency"
    authorizerSubject = "$context.authorizer.claims.sub"
  })
}

data "aws_iam_policy_document" "api_gateway_assume_role" {
  count = var.enable_stage3 ? 1 : 0

  statement {
    actions = ["sts:AssumeRole"]
    effect  = "Allow"

    principals {
      type        = "Service"
      identifiers = ["apigateway.amazonaws.com"]
    }
  }
}

resource "aws_cloudwatch_log_group" "stage3_access" {
  count = var.enable_stage3 ? 1 : 0

  name              = "/aws/apigateway/${var.name_prefix}-control-plane-access"
  retention_in_days = var.log_retention_days
}

data "aws_iam_policy_document" "api_gateway_logs" {
  count = var.enable_stage3 ? 1 : 0

  statement {
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:DescribeLogGroups",
      "logs:DescribeLogStreams",
      "logs:PutLogEvents",
      "logs:GetLogEvents",
      "logs:FilterLogEvents",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role" "api_gateway_cloudwatch" {
  count = var.enable_stage3 ? 1 : 0

  name               = "${var.name_prefix}-api-gateway-cloudwatch"
  assume_role_policy = data.aws_iam_policy_document.api_gateway_assume_role[0].json
}

resource "aws_iam_role_policy" "api_gateway_cloudwatch" {
  count = var.enable_stage3 ? 1 : 0

  name   = "${var.name_prefix}-api-gateway-cloudwatch"
  role   = aws_iam_role.api_gateway_cloudwatch[0].id
  policy = data.aws_iam_policy_document.api_gateway_logs[0].json
}

resource "aws_api_gateway_account" "stage3" {
  count = var.enable_stage3 ? 1 : 0

  cloudwatch_role_arn = aws_iam_role.api_gateway_cloudwatch[0].arn

  depends_on = [aws_iam_role_policy.api_gateway_cloudwatch[0]]
}

resource "aws_api_gateway_rest_api" "stage3" {
  count = var.enable_stage3 ? 1 : 0

  name              = "${var.name_prefix}-control-plane"
  api_key_source    = "HEADER"
  put_rest_api_mode = "overwrite"
  body              = jsonencode(local.stage3_openapi_document)

  endpoint_configuration {
    types = ["REGIONAL"]
  }

  lifecycle {
    precondition {
      condition     = local.stage3_dependencies_ready
      error_message = local.stage3_dependency_error
    }
  }
}

resource "aws_api_gateway_gateway_response" "default_4xx" {
  count = var.enable_stage3 ? 1 : 0

  rest_api_id         = aws_api_gateway_rest_api.stage3[0].id
  response_type       = "DEFAULT_4XX"
  response_parameters = local.stage3_gateway_cors_response_parameters
  response_templates = {
    "application/json" = "{\"message\":$context.error.messageString}"
  }
}

resource "aws_api_gateway_gateway_response" "default_5xx" {
  count = var.enable_stage3 ? 1 : 0

  rest_api_id         = aws_api_gateway_rest_api.stage3[0].id
  response_type       = "DEFAULT_5XX"
  response_parameters = local.stage3_gateway_cors_response_parameters
  response_templates = {
    "application/json" = "{\"message\":$context.error.messageString}"
  }
}

resource "aws_api_gateway_deployment" "stage3" {
  count = var.enable_stage3 ? 1 : 0

  rest_api_id = aws_api_gateway_rest_api.stage3[0].id
  triggers = {
    redeployment = sha1(jsonencode({
      body   = aws_api_gateway_rest_api.stage3[0].body
      routes = local.stage3_routes
    }))
  }

  lifecycle {
    create_before_destroy = true
  }

  depends_on = [
    aws_api_gateway_gateway_response.default_4xx[0],
    aws_api_gateway_gateway_response.default_5xx[0],
  ]
}

resource "aws_api_gateway_stage" "stage3" {
  count = var.enable_stage3 ? 1 : 0

  rest_api_id           = aws_api_gateway_rest_api.stage3[0].id
  deployment_id         = aws_api_gateway_deployment.stage3[0].id
  stage_name            = "prod"
  cache_cluster_enabled = true
  cache_cluster_size    = var.stage3_cache_cluster_size

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.stage3_access[0].arn
    format          = local.stage3_access_log_format
  }

  depends_on = [aws_api_gateway_account.stage3[0]]
}

resource "aws_api_gateway_method_settings" "default" {
  count = var.enable_stage3 ? 1 : 0

  rest_api_id = aws_api_gateway_rest_api.stage3[0].id
  stage_name  = aws_api_gateway_stage.stage3[0].stage_name
  method_path = "*/*"

  settings {
    metrics_enabled        = true
    data_trace_enabled     = false
    logging_level          = "INFO"
    throttling_burst_limit = var.stage3_throttling_burst_limit
    throttling_rate_limit  = var.stage3_throttling_rate_limit
    caching_enabled        = false
  }
}

resource "aws_api_gateway_method_settings" "cache" {
  for_each = var.enable_stage3 ? local.stage3_cache_paths : toset([])

  rest_api_id = aws_api_gateway_rest_api.stage3[0].id
  stage_name  = aws_api_gateway_stage.stage3[0].stage_name
  method_path = "${trim(each.value, "/")}/GET"

  settings {
    metrics_enabled                            = true
    data_trace_enabled                         = false
    logging_level                              = "INFO"
    throttling_burst_limit                     = var.stage3_throttling_burst_limit
    throttling_rate_limit                      = var.stage3_throttling_rate_limit
    caching_enabled                            = true
    cache_ttl_in_seconds                       = var.stage3_cache_ttl_seconds
    cache_data_encrypted                       = true
    require_authorization_for_cache_control    = true
    unauthorized_cache_control_header_strategy = "FAIL_WITH_403"
  }
}

resource "aws_api_gateway_api_key" "stage3" {
  count = var.enable_stage3 ? 1 : 0

  name    = "${var.name_prefix}-${var.aws_account_id}-rest-api-key"
  enabled = true
}

resource "aws_api_gateway_usage_plan" "stage3" {
  count = var.enable_stage3 ? 1 : 0

  name = "${var.name_prefix}-${var.aws_account_id}-rest-usage"

  api_stages {
    api_id = aws_api_gateway_rest_api.stage3[0].id
    stage  = aws_api_gateway_stage.stage3[0].stage_name

    dynamic "throttle" {
      for_each = local.stage3_operations
      content {
        path        = "/${trim(throttle.value.path, "/")}/${upper(throttle.value.method)}"
        burst_limit = var.stage3_throttling_burst_limit
        rate_limit  = var.stage3_throttling_rate_limit
      }
    }
  }

  quota_settings {
    limit  = var.stage3_daily_quota_limit
    offset = 0
    period = "DAY"
  }

  throttle_settings {
    burst_limit = var.stage3_throttling_burst_limit
    rate_limit  = var.stage3_throttling_rate_limit
  }
}

resource "aws_api_gateway_usage_plan_key" "stage3" {
  count = var.enable_stage3 ? 1 : 0

  key_id        = aws_api_gateway_api_key.stage3[0].id
  key_type      = "API_KEY"
  usage_plan_id = aws_api_gateway_usage_plan.stage3[0].id
}

resource "aws_lambda_permission" "session_service_rest" {
  count = var.enable_stage3 ? 1 : 0

  statement_id  = "AllowRestApiInvoke"
  action        = "lambda:InvokeFunction"
  function_name = lookup(local.stage3_function_names, "session_service", null)
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.stage3[0].execution_arn}/*/*"

  lifecycle {
    precondition {
      condition     = local.stage3_dependencies_ready
      error_message = local.stage3_dependency_error
    }
  }
}

resource "aws_lambda_permission" "item_service_rest" {
  count = var.enable_stage3 ? 1 : 0

  statement_id  = "AllowRestApiInvoke"
  action        = "lambda:InvokeFunction"
  function_name = lookup(local.stage3_function_names, "item_service", null)
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.stage3[0].execution_arn}/*/*"

  lifecycle {
    precondition {
      condition     = local.stage3_dependencies_ready
      error_message = local.stage3_dependency_error
    }
  }
}

resource "aws_lambda_permission" "query_service_rest" {
  count = var.enable_stage3 ? 1 : 0

  statement_id  = "AllowRestApiInvoke"
  action        = "lambda:InvokeFunction"
  function_name = lookup(local.stage3_function_names, "query_service", null)
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.stage3[0].execution_arn}/*/*"

  lifecycle {
    precondition {
      condition     = local.stage3_dependencies_ready
      error_message = local.stage3_dependency_error
    }
  }
}

resource "aws_lambda_permission" "admin_command_rest" {
  count = var.enable_stage3 ? 1 : 0

  statement_id  = "AllowRestApiInvoke"
  action        = "lambda:InvokeFunction"
  function_name = lookup(local.stage3_function_names, "admin_command", null)
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.stage3[0].execution_arn}/*/*"

  lifecycle {
    precondition {
      condition     = local.stage3_dependencies_ready
      error_message = local.stage3_dependency_error
    }
  }
}

locals {
  stage3_invoke_url = (
    var.enable_stage3 ? try(
      "https://${aws_api_gateway_rest_api.stage3[0].id}.execute-api.${var.aws_region}.amazonaws.com/${aws_api_gateway_stage.stage3[0].stage_name}",
      null
    ) : null
  )
}
