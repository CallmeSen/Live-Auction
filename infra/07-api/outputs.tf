output "websocket_api_id" {
  value = aws_apigatewayv2_api.websocket.id
}

output "websocket_stage_name" {
  value = aws_apigatewayv2_stage.websocket.name
}

output "websocket_url" {
  value = local.websocket_url
}

output "websocket_management_endpoint" {
  value = local.websocket_management_endpoint
}

output "stage3_rest_api_id" {
  value = var.enable_stage3 ? aws_api_gateway_rest_api.stage3[0].id : null
}

output "stage3_rest_execution_arn" {
  value = var.enable_stage3 ? aws_api_gateway_rest_api.stage3[0].execution_arn : null
}

output "stage3_rest_invoke_url" {
  value = var.enable_stage3 ? local.stage3_invoke_url : null
}

output "stage3_rest_api_key_id" {
  value = var.enable_stage3 ? aws_api_gateway_api_key.stage3[0].id : null
}

output "stage3_rest_stage_name" {
  value = var.enable_stage3 ? aws_api_gateway_stage.stage3[0].stage_name : null
}
