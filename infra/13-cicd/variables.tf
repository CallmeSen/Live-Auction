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

  validation {
    condition     = can(regex("^[A-Za-z0-9][A-Za-z0-9_-]{0,44}$", var.name_prefix))
    error_message = "name_prefix must start with an ASCII letter or number and contain only ASCII letters, numbers, hyphens, or underscores."
  }
}

variable "owner" {
  type    = string
  default = "thesis"
}

variable "full_repository_id" {
  description = "GitHub repository in owner/name form; never store a token here."
  type        = string

  validation {
    condition     = can(regex("^[^/[:space:]]+/[^/[:space:]]+$", trimspace(var.full_repository_id)))
    error_message = "full_repository_id must be a real GitHub owner/name value."
  }
}

variable "branch_name" {
  type    = string
  default = "develop"

  validation {
    condition     = length(trimspace(var.branch_name)) > 0
    error_message = "branch_name must not be empty."
  }
}

variable "connection_name" {
  type    = string
  default = "la-github"
}

variable "artifact_bucket_name" {
  description = "Optional globally unique S3 bucket name; account-scoped fallback is used when empty."
  type        = string
  default     = ""
}

variable "pipeline_name" {
  type    = string
  default = "la-pipeline"
}

variable "build_project_name" {
  type    = string
  default = "la-build"
}

variable "codedeploy_app_name" {
  type    = string
  default = "la-lambda-app"
}

variable "deployment_group_name" {
  type    = string
  default = "la-bid-processor-dg"
}

variable "deployment_config_name" {
  type    = string
  default = "CodeDeployDefault.LambdaCanary10Percent5Minutes"
}

variable "function_name" {
  type    = string
  default = "la-bid-processor"
}

variable "function_alias_name" {
  type    = string
  default = "live"
}

variable "initial_function_version" {
  description = "Published Lambda version that receives the initial live alias. The pipeline owns later versions."
  type        = string

  validation {
    condition     = can(regex("^[1-9][0-9]*$", var.initial_function_version))
    error_message = "initial_function_version must be a published positive Lambda version number."
  }
}

variable "alarm_name" {
  type    = string
  default = "la-bid-processor-errors"
}
