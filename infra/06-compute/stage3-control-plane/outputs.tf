output "stage3_functions" {
  value = var.enable_stage3 ? {
    session_service = {
      name       = aws_lambda_function.session_service[0].function_name
      arn        = aws_lambda_function.session_service[0].arn
      invoke_arn = aws_lambda_function.session_service[0].invoke_arn
    }
    item_service = {
      name       = aws_lambda_function.item_service[0].function_name
      arn        = aws_lambda_function.item_service[0].arn
      invoke_arn = aws_lambda_function.item_service[0].invoke_arn
    }
    query_service = {
      name       = aws_lambda_function.query_service[0].function_name
      arn        = aws_lambda_function.query_service[0].arn
      invoke_arn = aws_lambda_function.query_service[0].invoke_arn
    }
    admin_command = {
      name       = aws_lambda_function.admin_command[0].function_name
      arn        = aws_lambda_function.admin_command[0].arn
      invoke_arn = aws_lambda_function.admin_command[0].invoke_arn
    }
  } : {}
}

output "stage3_cors_allowed_origin" {
  value = var.stage3_cors_allowed_origin
}
