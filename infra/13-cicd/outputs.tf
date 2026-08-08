output "connection_arn" {
  value = aws_codestarconnections_connection.github.arn
}

output "bid_processor_live_alias_arn" {
  value = aws_lambda_alias.bid_processor_live.arn
}

output "artifact_bucket_name" {
  value = aws_s3_bucket.artifacts.bucket
}

output "codebuild_project_name" {
  value = aws_codebuild_project.build.name
}

output "codepipeline_name" {
  value = aws_codepipeline.main.name
}

output "codedeploy_app_name" {
  value = aws_codedeploy_app.lambda.name
}

output "deployment_group_name" {
  value = aws_codedeploy_deployment_group.bid_processor.deployment_group_name
}

output "pipeline_role_arn" {
  value = aws_iam_role.codepipeline.arn
}
