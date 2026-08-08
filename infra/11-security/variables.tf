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

variable "access_analyzer_name" {
  description = "Account-level IAM Access Analyzer used for policy validation evidence."
  type        = string
  default     = "la-access-analyzer"
}
