data "terraform_remote_state" "compute" {
  backend = "s3"

  config = {
    bucket         = "la-tfstate-233376973052"
    key            = "06-compute/terraform.tfstate"
    region         = "ap-southeast-1"
    dynamodb_table = "la-tflock"
    encrypt        = true
  }
}

resource "aws_apigatewayv2_api" "websocket" {
  name                       = "${var.name_prefix}-websocket"
  protocol_type              = "WEBSOCKET"
  route_selection_expression = "$request.body.action"
}

resource "aws_apigatewayv2_authorizer" "connect" {
  api_id           = aws_apigatewayv2_api.websocket.id
  authorizer_type  = "REQUEST"
  authorizer_uri   = data.terraform_remote_state.compute.outputs.ws_authorizer_invoke_arn
  identity_sources = ["route.request.querystring.token"]
  name             = "${var.name_prefix}-ws-authorizer"
}

resource "aws_apigatewayv2_integration" "ws_handler" {
  api_id             = aws_apigatewayv2_api.websocket.id
  integration_type   = "AWS_PROXY"
  integration_method = "POST"
  integration_uri    = data.terraform_remote_state.compute.outputs.ws_handler_invoke_arn
}

resource "aws_apigatewayv2_route" "connect" {
  api_id             = aws_apigatewayv2_api.websocket.id
  route_key          = "$connect"
  authorization_type = "CUSTOM"
  authorizer_id      = aws_apigatewayv2_authorizer.connect.id
  target             = "integrations/${aws_apigatewayv2_integration.ws_handler.id}"
}

resource "aws_apigatewayv2_route" "disconnect" {
  api_id             = aws_apigatewayv2_api.websocket.id
  route_key          = "$disconnect"
  authorization_type = "NONE"
  target             = "integrations/${aws_apigatewayv2_integration.ws_handler.id}"
}

resource "aws_apigatewayv2_route" "join_room" {
  api_id             = aws_apigatewayv2_api.websocket.id
  route_key          = "joinRoom"
  authorization_type = "NONE"
  target             = "integrations/${aws_apigatewayv2_integration.ws_handler.id}"
}

resource "aws_apigatewayv2_route" "place_bid" {
  api_id             = aws_apigatewayv2_api.websocket.id
  route_key          = "placeBid"
  authorization_type = "NONE"
  target             = "integrations/${aws_apigatewayv2_integration.ws_handler.id}"
}

resource "aws_apigatewayv2_stage" "websocket" {
  api_id      = aws_apigatewayv2_api.websocket.id
  name        = "prod"
  auto_deploy = true
}

resource "aws_lambda_permission" "ws_authorizer" {
  statement_id  = "AllowWebSocketAuthorizerInvoke"
  action        = "lambda:InvokeFunction"
  function_name = data.terraform_remote_state.compute.outputs.ws_authorizer_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.websocket.execution_arn}/authorizers/${aws_apigatewayv2_authorizer.connect.id}"
}

resource "aws_lambda_permission" "ws_handler" {
  statement_id  = "AllowWebSocketHandlerInvoke"
  action        = "lambda:InvokeFunction"
  function_name = data.terraform_remote_state.compute.outputs.ws_handler_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.websocket.execution_arn}/*"
}

locals {
  websocket_url                 = "wss://${aws_apigatewayv2_api.websocket.id}.execute-api.${var.aws_region}.amazonaws.com/${aws_apigatewayv2_stage.websocket.name}"
  websocket_management_endpoint = "https://${aws_apigatewayv2_api.websocket.id}.execute-api.${var.aws_region}.amazonaws.com/${aws_apigatewayv2_stage.websocket.name}"
}
