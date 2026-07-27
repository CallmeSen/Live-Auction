variable "aws_region" {
  type    = string
  default = "ap-southeast-1"

  validation {
    condition     = var.aws_region == "ap-southeast-1"
    error_message = "aws_region must be ap-southeast-1 for Stage 3 deployment."
  }
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
  description = "Shared resource prefix: 1 to 45 ASCII letters, numbers, hyphens, or underscores; must start with an ASCII letter or number."
  type        = string
  default     = "la"

  validation {
    condition = (
      length(var.name_prefix) >= 1 &&
      length(var.name_prefix) <= 45 &&
      can(regex("^[A-Za-z0-9][A-Za-z0-9_-]{0,44}$", var.name_prefix))
    )
    error_message = "name_prefix must be 1 to 45 characters, start with an ASCII letter or number, and contain only ASCII letters, numbers, hyphens, or underscores."
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

variable "log_retention_days" {
  type    = number
  default = 14
}

variable "max_media_bytes" {
  type    = number
  default = 5242880

  validation {
    condition = (
      var.max_media_bytes > 0 &&
      var.max_media_bytes <= 5242880 &&
      floor(var.max_media_bytes) == var.max_media_bytes
    )
    error_message = "max_media_bytes must be a positive integer no greater than 5242880 bytes."
  }
}

variable "stage3_cors_allowed_origin" {
  description = "Exact browser origin allowed to read Stage 3 REST responses."
  type        = string
  default     = "http://localhost:5173"

  validation {
    condition = (
      length(var.stage3_cors_allowed_origin) <= 255 &&
      can(regex("^https?://[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*(:[0-9]{1,5})?$", var.stage3_cors_allowed_origin)) &&
      !strcontains(var.stage3_cors_allowed_origin, "*") &&
      var.stage3_cors_allowed_origin == lower(var.stage3_cors_allowed_origin) &&
      try(tonumber(regex(":([0-9]{1,5})$", var.stage3_cors_allowed_origin)[0]), 1) >= 1 &&
      try(tonumber(regex(":([0-9]{1,5})$", var.stage3_cors_allowed_origin)[0]), 1) <= 65535
    )
    error_message = "stage3_cors_allowed_origin must be one lowercase HTTP or HTTPS origin with valid DNS labels and an optional port from 1 to 65535; paths, userinfo, wildcards, queries, and fragments are not allowed."
  }
}
