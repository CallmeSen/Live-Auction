output "bid_processor_function_name" {
  value = aws_lambda_function.bid_processor.function_name
}

output "bid_processor_function_arn" {
  value = aws_lambda_function.bid_processor.arn
}

output "bid_processor_role_arn" {
  value = aws_iam_role.bid_processor.arn
}

output "common_layer_arn" {
  value = aws_lambda_layer_version.common.arn
}

output "bid_processor_log_group_name" {
  value = aws_cloudwatch_log_group.bid_processor.name
}

output "bid_event_source_mapping_uuid" {
  value = aws_lambda_event_source_mapping.bid.uuid
}

output "ws_authorizer_function_name" {
  value = aws_lambda_function.ws_authorizer.function_name
}

output "ws_authorizer_function_arn" {
  value = aws_lambda_function.ws_authorizer.arn
}

output "ws_authorizer_invoke_arn" {
  value = aws_lambda_function.ws_authorizer.invoke_arn
}

output "ws_authorizer_role_arn" {
  value = aws_iam_role.ws_authorizer.arn
}

output "ws_authorizer_log_group_name" {
  value = aws_cloudwatch_log_group.ws_authorizer.name
}

output "ws_handler_function_name" {
  value = aws_lambda_function.ws_handler.function_name
}

output "ws_handler_function_arn" {
  value = aws_lambda_function.ws_handler.arn
}

output "ws_handler_invoke_arn" {
  value = aws_lambda_function.ws_handler.invoke_arn
}

output "ws_handler_role_arn" {
  value = aws_iam_role.ws_handler.arn
}

output "ws_handler_log_group_name" {
  value = aws_cloudwatch_log_group.ws_handler.name
}

output "broadcast_function_name" {
  value = aws_lambda_function.broadcast.function_name
}

output "broadcast_function_arn" {
  value = aws_lambda_function.broadcast.arn
}

output "broadcast_invoke_arn" {
  value = aws_lambda_function.broadcast.invoke_arn
}

output "broadcast_role_arn" {
  value = aws_iam_role.broadcast.arn
}

output "broadcast_log_group_name" {
  value = aws_cloudwatch_log_group.broadcast.name
}
