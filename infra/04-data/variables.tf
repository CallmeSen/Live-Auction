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
  description = "Environment-unique operator prefix; account and region scope the media bucket name, but external S3 ownership cannot be guaranteed."
  type        = string
  default     = "la"
}

variable "owner" {
  type    = string
  default = "thesis"
}

variable "enable_stage3" {
  type    = bool
  default = false
}

variable "media_allowed_origins" {
  type    = list(string)
  default = ["http://localhost:5173"]

  validation {
    condition = (
      length(var.media_allowed_origins) > 0 &&
      length(distinct(var.media_allowed_origins)) == length(var.media_allowed_origins) &&
      alltrue([
        for origin in var.media_allowed_origins :
        can(regex("^https?://[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*(:[0-9]{1,5})?$", origin)) &&
        !strcontains(origin, "*") &&
        origin == lower(origin) &&
        try(tonumber(regex(":([0-9]{1,5})$", origin)[0]), 1) >= 1 &&
        try(tonumber(regex(":([0-9]{1,5})$", origin)[0]), 1) <= 65535
      ])
    )
    error_message = "Media allowed origins must be unique lowercase HTTP(S) origins with valid DNS labels and optional ports from 1 to 65535; paths, userinfo, wildcards, queries, and fragments are not allowed."
  }
}
