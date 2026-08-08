locals {
  common_tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
    Owner       = var.owner
  }
}

provider "aws" {
  region              = var.aws_region
  allowed_account_ids = ["233376973052"]

  default_tags {
    tags = local.common_tags
  }
}
