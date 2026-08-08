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

variable "lambda_memory_size" {
  type    = number
  default = 512

  validation {
    condition     = var.lambda_memory_size >= 128 && var.lambda_memory_size <= 10240
    error_message = "lambda_memory_size must be between 128 and 10240 MB."
  }
}

variable "lambda_timeout_seconds" {
  type    = number
  default = 30

  validation {
    condition     = var.lambda_timeout_seconds >= 1 && var.lambda_timeout_seconds <= 60
    error_message = "lambda_timeout_seconds must be between 1 and the queue visibility timeout of 60 seconds."
  }
}

variable "log_retention_days" {
  type    = number
  default = 14
}

variable "ws_management_endpoint" {
  type    = string
  default = ""
}

variable "enable_broadcast" {
  type    = bool
  default = false
}
