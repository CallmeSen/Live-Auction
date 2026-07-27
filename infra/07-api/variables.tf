variable "aws_region" {
  type    = string
  default = "ap-southeast-1"
}

variable "project" {
  type    = string
  default = "live-auction"
}

variable "environment" {
  type    = string
  default = "dev"
}

variable "name_prefix" {
  description = "Resource prefix: 1 to 41 ASCII letters, numbers, hyphens, or underscores."
  type        = string
  default     = "la"

  validation {
    condition = (
      length(var.name_prefix) >= 1 &&
      length(var.name_prefix) <= 41 &&
      can(regex("^[A-Za-z0-9][A-Za-z0-9_-]{0,40}$", var.name_prefix))
    )
    error_message = "name_prefix must be 1 to 41 characters and contain only ASCII letters, numbers, hyphens, or underscores."
  }
}

variable "owner" {
  type    = string
  default = "thesis"
}

variable "enable_stage3" {
  type    = bool
  default = false
}

variable "aws_account_id" {
  type    = string
  default = "233376973052"

  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id))
    error_message = "aws_account_id must contain exactly 12 digits."
  }
}

variable "log_retention_days" {
  type    = number
  default = 14
}

variable "stage3_cache_cluster_size" {
  description = "API Gateway cache cluster size in GB."
  type        = string
  default     = "0.5"

  validation {
    condition = contains(
      ["0.5", "1.6", "6.1", "13.5", "28.4", "58.2", "118", "237"],
      var.stage3_cache_cluster_size
    )
    error_message = "stage3_cache_cluster_size must be a supported API Gateway cache size."
  }
}

variable "stage3_cache_ttl_seconds" {
  description = "TTL for the four approved public GET caches."
  type        = number
  default     = 60

  validation {
    condition = (
      floor(var.stage3_cache_ttl_seconds) == var.stage3_cache_ttl_seconds &&
      var.stage3_cache_ttl_seconds >= 1 &&
      var.stage3_cache_ttl_seconds <= 3600
    )
    error_message = "stage3_cache_ttl_seconds must be an integer from 1 through 3600."
  }
}

variable "stage3_daily_quota_limit" {
  description = "Maximum API-key requests allowed per day."
  type        = number
  default     = 10000

  validation {
    condition = (
      floor(var.stage3_daily_quota_limit) == var.stage3_daily_quota_limit &&
      var.stage3_daily_quota_limit >= 1 &&
      var.stage3_daily_quota_limit <= 1000000
    )
    error_message = "stage3_daily_quota_limit must be an integer from 1 through 1000000."
  }
}

variable "stage3_throttling_burst_limit" {
  description = "Maximum Stage 3 REST request burst."
  type        = number
  default     = 100

  validation {
    condition = (
      floor(var.stage3_throttling_burst_limit) == var.stage3_throttling_burst_limit &&
      var.stage3_throttling_burst_limit >= 1 &&
      var.stage3_throttling_burst_limit <= 5000
    )
    error_message = "stage3_throttling_burst_limit must be an integer from 1 through 5000."
  }
}

variable "stage3_throttling_rate_limit" {
  description = "Maximum sustained Stage 3 REST requests per second."
  type        = number
  default     = 50

  validation {
    condition = (
      var.stage3_throttling_rate_limit > 0 &&
      var.stage3_throttling_rate_limit <= 10000
    )
    error_message = "stage3_throttling_rate_limit must be greater than 0 and no greater than 10000."
  }
}
