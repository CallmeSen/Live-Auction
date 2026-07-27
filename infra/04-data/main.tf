locals {
  table_names = {
    item_auction_state    = "${var.name_prefix}_item_auction_state"
    bid_events            = "${var.name_prefix}_bid_events"
    websocket_connections = "${var.name_prefix}_websocket_connections"
    item_bidder_aliases   = "${var.name_prefix}_item_bidder_aliases"
    idempotency           = "${var.name_prefix}_idempotency"
    auction_catalog       = "${var.name_prefix}_auction_catalog"
  }
}

resource "aws_dynamodb_table" "item_auction_state" {
  name         = local.table_names.item_auction_state
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "item_id"

  attribute {
    name = "item_id"
    type = "S"
  }

  stream_enabled   = true
  stream_view_type = "NEW_AND_OLD_IMAGES"

  server_side_encryption {
    enabled = true
  }

  point_in_time_recovery {
    enabled = true
  }
}

resource "aws_dynamodb_table" "bid_events" {
  name         = local.table_names.bid_events
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "item_id"
  range_key    = "sk"

  attribute {
    name = "item_id"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  stream_enabled   = true
  stream_view_type = "NEW_IMAGE"

  server_side_encryption {
    enabled = true
  }

  point_in_time_recovery {
    enabled = true
  }
}

resource "aws_dynamodb_table" "websocket_connections" {
  name         = local.table_names.websocket_connections
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "item_id"
  range_key    = "connection_id"

  attribute {
    name = "item_id"
    type = "S"
  }

  attribute {
    name = "connection_id"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  server_side_encryption {
    enabled = true
  }
}

resource "aws_dynamodb_table" "item_bidder_aliases" {
  name         = local.table_names.item_bidder_aliases
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "item_id"
  range_key    = "user_id"

  attribute {
    name = "item_id"
    type = "S"
  }

  attribute {
    name = "user_id"
    type = "S"
  }

  server_side_encryption {
    enabled = true
  }
}

resource "aws_dynamodb_table" "idempotency" {
  name         = local.table_names.idempotency
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  ttl {
    attribute_name = "expiration"
    enabled        = true
  }

  server_side_encryption {
    enabled = true
  }
}

data "aws_caller_identity" "current" {
  count = var.enable_stage3 ? 1 : 0
}

resource "aws_dynamodb_table" "auction_catalog" {
  count = var.enable_stage3 ? 1 : 0

  name         = local.table_names.auction_catalog
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  attribute {
    name = "gsi1pk"
    type = "S"
  }

  attribute {
    name = "gsi1sk"
    type = "S"
  }

  attribute {
    name = "gsi2pk"
    type = "S"
  }

  attribute {
    name = "gsi2sk"
    type = "S"
  }

  global_secondary_index {
    name            = "gsi1"
    projection_type = "ALL"

    key_schema {
      attribute_name = "gsi1pk"
      key_type       = "HASH"
    }

    key_schema {
      attribute_name = "gsi1sk"
      key_type       = "RANGE"
    }
  }

  global_secondary_index {
    name            = "gsi2"
    projection_type = "ALL"

    key_schema {
      attribute_name = "gsi2pk"
      key_type       = "HASH"
    }

    key_schema {
      attribute_name = "gsi2sk"
      key_type       = "RANGE"
    }
  }

  server_side_encryption {
    enabled = true
  }

  point_in_time_recovery {
    enabled = true
  }
}

resource "aws_dynamodb_global_secondary_index" "bid_events_by_bidder" {
  count = var.enable_stage3 ? 1 : 0

  table_name = aws_dynamodb_table.bid_events.name
  index_name = "bidder_sub-sk-index"

  projection {
    projection_type = "ALL"
  }

  key_schema {
    attribute_name = "bidder_sub"
    attribute_type = "S"
    key_type       = "HASH"
  }

  key_schema {
    attribute_name = "sk"
    attribute_type = "S"
    key_type       = "RANGE"
  }
}

resource "aws_s3_bucket" "media" {
  count = var.enable_stage3 ? 1 : 0

  bucket        = "${var.name_prefix}-item-media-${data.aws_caller_identity.current[0].account_id}-${var.aws_region}"
  force_destroy = false

  lifecycle {
    precondition {
      condition = (
        can(regex("^[a-z0-9]([a-z0-9]*(-[a-z0-9]+)*)?$", var.name_prefix)) &&
        !startswith(var.name_prefix, "xn--") &&
        !startswith(var.name_prefix, "sthree-") &&
        !startswith(var.name_prefix, "amzn-s3-demo-")
      )
      error_message = "When Stage 3 is enabled, name_prefix must use lowercase letters and digits separated only by single hyphens, and must not use a reserved S3 prefix."
    }

    precondition {
      condition     = length("${var.name_prefix}-item-media-000000000000-${var.aws_region}") <= 63
      error_message = "The Stage 3 media bucket name must be 63 characters or fewer with a 12-digit AWS account ID."
    }
  }
}

resource "aws_s3_bucket_public_access_block" "media" {
  count = var.enable_stage3 ? 1 : 0

  bucket = aws_s3_bucket.media[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "media" {
  count = var.enable_stage3 ? 1 : 0

  bucket = aws_s3_bucket.media[0].id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "media" {
  count = var.enable_stage3 ? 1 : 0

  bucket = aws_s3_bucket.media[0].id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "media" {
  count = var.enable_stage3 ? 1 : 0

  bucket = aws_s3_bucket.media[0].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "media" {
  count = var.enable_stage3 ? 1 : 0

  bucket = aws_s3_bucket.media[0].id

  rule {
    id     = "abort-incomplete-multipart-uploads"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  depends_on = [aws_s3_bucket_versioning.media]
}

resource "aws_s3_bucket_cors_configuration" "media" {
  count = var.enable_stage3 ? 1 : 0

  bucket = aws_s3_bucket.media[0].id

  cors_rule {
    allowed_origins = var.media_allowed_origins
    allowed_methods = ["POST", "GET"]
    allowed_headers = ["Content-Type"]
  }
}
