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

variable "securityhub_cis_version" {
  type    = string
  default = "1.4.0"

  validation {
    condition     = can(regex("^[0-9]+\\.[0-9]+\\.[0-9]+$", var.securityhub_cis_version))
    error_message = "securityhub_cis_version must use semantic version form, for example 1.4.0."
  }
}

variable "enable_securityhub" {
  description = "Enable Security Hub CSPM and the CIS standards subscription."
  type        = bool
  default     = true
}
