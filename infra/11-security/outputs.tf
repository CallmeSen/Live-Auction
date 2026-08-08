output "audit_bucket_name" {
  value = aws_s3_bucket.audit.bucket
}

output "audit_bucket_arn" {
  value = aws_s3_bucket.audit.arn
}

output "cloudtrail_arn" {
  value = aws_cloudtrail.main.arn
}

output "config_recorder_name" {
  value = aws_config_configuration_recorder.main.name
}

output "access_analyzer_arn" {
  value = aws_accessanalyzer_analyzer.account.arn
}

output "access_analyzer_name" {
  value = aws_accessanalyzer_analyzer.account.analyzer_name
}
