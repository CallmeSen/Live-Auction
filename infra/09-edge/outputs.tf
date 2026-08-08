output "frontend_bucket_name" {
  value = aws_s3_bucket.frontend.bucket
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.frontend.id
}

output "cloudfront_domain_name" {
  value = aws_cloudfront_distribution.frontend.domain_name
}

output "cloudfront_origin" {
  value = "https://${aws_cloudfront_distribution.frontend.domain_name}"
}

output "admin_frontend_bucket_name" {
  value = aws_s3_bucket.admin_frontend.bucket
}

output "admin_cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.admin_frontend.id
}

output "admin_cloudfront_domain_name" {
  value = aws_cloudfront_distribution.admin_frontend.domain_name
}

output "admin_cloudfront_origin" {
  value = "https://${aws_cloudfront_distribution.admin_frontend.domain_name}"
}

output "media_cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.media.id
}

output "media_cloudfront_domain_name" {
  value = aws_cloudfront_distribution.media.domain_name
}

output "media_cloudfront_origin" {
  value = "https://${aws_cloudfront_distribution.media.domain_name}"
}
