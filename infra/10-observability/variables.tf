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
  type    = string
  default = "la"
}

variable "owner" {
  type    = string
  default = "thesis"
}

variable "sns_alarm_email" {
  description = "Optional operator address. SNS sends a confirmation request after apply."
  type        = string
  default     = ""

  validation {
    condition     = var.sns_alarm_email == "" || can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.sns_alarm_email))
    error_message = "sns_alarm_email must be empty or a valid email address."
  }
}

variable "alarm_period_seconds" {
  type    = number
  default = 60

  validation {
    condition     = contains([60, 300, 900], var.alarm_period_seconds)
    error_message = "alarm_period_seconds must be 60, 300, or 900."
  }
}

variable "rejected_bid_threshold" {
  type    = number
  default = 1

  validation {
    condition     = var.rejected_bid_threshold >= 1
    error_message = "rejected_bid_threshold must be at least 1."
  }
}

variable "bid_latency_p95_threshold_ms" {
  type    = number
  default = 1000

  validation {
    condition     = var.bid_latency_p95_threshold_ms > 0
    error_message = "bid_latency_p95_threshold_ms must be positive."
  }
}
