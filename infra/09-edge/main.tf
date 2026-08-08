data "aws_caller_identity" "current" {}

data "terraform_remote_state" "data" {
  backend = "s3"

  config = {
    bucket         = "la-tfstate-233376973052"
    key            = "04-data/terraform.tfstate"
    region         = "ap-southeast-1"
    dynamodb_table = "la-tflock"
    encrypt        = true
  }
}

locals {
  media_bucket_name = data.terraform_remote_state.data.outputs.media_bucket_name
}

data "aws_s3_bucket" "media" {
  bucket = local.media_bucket_name
}

locals {
  frontend_bucket_name       = "${var.name_prefix}-${var.environment}-frontend-${data.aws_caller_identity.current.account_id}"
  admin_frontend_bucket_name = "${var.name_prefix}-${var.environment}-admin-frontend-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket" "frontend" {
  bucket = local.frontend_bucket_name
}

resource "aws_s3_bucket_versioning" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "${var.name_prefix}-${var.environment}-frontend-oac"
  description                       = "OAC for the Live Auction frontend S3 origin"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  comment             = "${var.project} ${var.environment} frontend"
  default_root_object = "index.html"
  price_class         = "PriceClass_100"

  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "frontend-s3"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  default_cache_behavior {
    target_origin_id       = "frontend-s3"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    forwarded_values {
      query_string = false

      cookies {
        forward = "none"
      }
    }
  }

  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudFrontServicePrincipalReadOnly"
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.frontend.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.frontend.arn
          }
        }
      }
    ]
  })
}

resource "aws_s3_bucket" "admin_frontend" {
  bucket = local.admin_frontend_bucket_name
}

resource "aws_s3_bucket_versioning" "admin_frontend" {
  bucket = aws_s3_bucket.admin_frontend.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "admin_frontend" {
  bucket = aws_s3_bucket.admin_frontend.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "admin_frontend" {
  bucket = aws_s3_bucket.admin_frontend.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_cloudfront_origin_access_control" "admin_frontend" {
  name                              = "${var.name_prefix}-${var.environment}-admin-frontend-oac"
  description                       = "OAC for the Live Auction admin frontend S3 origin"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "admin_frontend" {
  enabled             = true
  comment             = "${var.project} ${var.environment} admin frontend"
  default_root_object = "index.html"
  price_class         = "PriceClass_100"

  origin {
    domain_name              = aws_s3_bucket.admin_frontend.bucket_regional_domain_name
    origin_id                = "admin-frontend-s3"
    origin_access_control_id = aws_cloudfront_origin_access_control.admin_frontend.id
  }

  default_cache_behavior {
    target_origin_id       = "admin-frontend-s3"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    forwarded_values {
      query_string = false

      cookies {
        forward = "none"
      }
    }
  }

  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

resource "aws_s3_bucket_policy" "admin_frontend" {
  bucket = aws_s3_bucket.admin_frontend.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudFrontServicePrincipalReadOnly"
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.admin_frontend.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.admin_frontend.arn
          }
        }
      }
    ]
  })
}

resource "aws_cloudfront_origin_access_control" "media" {
  name                              = "${var.name_prefix}-${var.environment}-media-oac"
  description                       = "OAC for private Live Auction item media"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "media" {
  enabled         = true
  comment         = "${var.project} ${var.environment} item media"
  price_class     = "PriceClass_100"
  is_ipv6_enabled = true

  origin {
    domain_name              = data.aws_s3_bucket.media.bucket_regional_domain_name
    origin_id                = "media-s3"
    origin_access_control_id = aws_cloudfront_origin_access_control.media.id
  }

  default_cache_behavior {
    target_origin_id       = "media-s3"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    forwarded_values {
      query_string = false

      cookies {
        forward = "none"
      }
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

resource "aws_s3_bucket_policy" "media" {
  bucket = data.aws_s3_bucket.media.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowMediaCloudFrontReadOnly"
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${data.aws_s3_bucket.media.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.media.arn
          }
        }
      }
    ]
  })
}
