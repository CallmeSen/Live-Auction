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

variable "backup_schedule" {
  description = "UTC schedule for the daily backup job."
  type        = string
  default     = "cron(0 18 * * ? *)"
}

variable "backup_delete_after_days" {
  type    = number
  default = 35

  validation {
    condition     = var.backup_delete_after_days >= 7
    error_message = "backup_delete_after_days must retain backups for at least 7 days."
  }
}
