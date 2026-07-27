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
  description = "Shared resource prefix: 1 to 47 ASCII letters, numbers, hyphens, or underscores; must start with an ASCII letter or number."
  type        = string
  default     = "la"

  validation {
    condition = (
      length(var.name_prefix) >= 1 &&
      length(var.name_prefix) <= 47 &&
      can(regex("^[A-Za-z0-9][A-Za-z0-9_-]{0,46}$", var.name_prefix))
    )
    error_message = "name_prefix must be 1 to 47 characters, start with an ASCII letter or number, and contain only ASCII letters, numbers, hyphens, or underscores."
  }
}

variable "owner" {
  type    = string
  default = "thesis"
}

variable "message_retention_seconds" {
  type    = number
  default = 345600
}

variable "dlq_message_retention_seconds" {
  type    = number
  default = 1209600
}

variable "visibility_timeout_seconds" {
  type    = number
  default = 60
}

variable "max_receive_count" {
  type    = number
  default = 5
}

variable "enable_stage3" {
  type    = bool
  default = false
}

variable "scheduler_maximum_event_age_seconds" {
  type    = number
  default = 3600

  validation {
    condition = (
      var.scheduler_maximum_event_age_seconds >= 60 &&
      var.scheduler_maximum_event_age_seconds <= 86400 &&
      floor(var.scheduler_maximum_event_age_seconds) == var.scheduler_maximum_event_age_seconds
    )
    error_message = "Scheduler maximum event age must be an integer from 60 through 86400 seconds."
  }
}

variable "scheduler_maximum_retry_attempts" {
  type    = number
  default = 3

  validation {
    condition = (
      var.scheduler_maximum_retry_attempts >= 0 &&
      var.scheduler_maximum_retry_attempts <= 185 &&
      floor(var.scheduler_maximum_retry_attempts) == var.scheduler_maximum_retry_attempts
    )
    error_message = "Scheduler maximum retry attempts must be an integer from 0 through 185."
  }
}

variable "scheduler_dlq_retention_seconds" {
  type    = number
  default = 1209600

  validation {
    condition = (
      var.scheduler_dlq_retention_seconds >= 60 &&
      var.scheduler_dlq_retention_seconds <= 1209600 &&
      floor(var.scheduler_dlq_retention_seconds) == var.scheduler_dlq_retention_seconds
    )
    error_message = "Scheduler DLQ retention must be an integer from 60 through 1209600 seconds."
  }
}
