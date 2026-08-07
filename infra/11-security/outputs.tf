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

output "securityhub_cis_subscription_arn" {
  value = try(aws_securityhub_standards_subscription.cis[0].id, null)
}
