data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

data "terraform_remote_state" "data" {
  backend = "s3"

  config = {
    bucket         = "la-tfstate-233376973052"
    key            = "04-data/terraform.tfstate"
    region         = "ap-southeast-1"
    dynamodb_table = "la-tflock"
    encrypt        = true
  }
}

locals {
  backup_resources = compact([
    try(data.terraform_remote_state.data.outputs.item_state_table_arn, null),
    try(data.terraform_remote_state.data.outputs.bid_events_table_arn, null),
    try(data.terraform_remote_state.data.outputs.websocket_connections_table_arn, null),
    try(data.terraform_remote_state.data.outputs.bidder_aliases_table_arn, null),
    try(data.terraform_remote_state.data.outputs.idempotency_table_arn, null),
    try(data.terraform_remote_state.data.outputs.auction_catalog_table_arn, null),
    try(data.terraform_remote_state.data.outputs.media_bucket_arn, null),
  ])
}

resource "aws_backup_vault" "main" {
  name = "${var.name_prefix}-vault"
}

data "aws_iam_policy_document" "backup_assume_role" {
  statement {
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["backup.amazonaws.com"]
    }

    actions = ["sts:AssumeRole"]
  }
}

resource "aws_iam_role" "backup" {
  name               = "${var.name_prefix}-backup-service"
  assume_role_policy = data.aws_iam_policy_document.backup_assume_role.json
}

resource "aws_iam_role_policy_attachment" "backup" {
  role       = aws_iam_role.backup.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForBackup"
}

resource "aws_iam_role_policy_attachment" "restore" {
  role       = aws_iam_role.backup.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForRestores"
}

resource "aws_backup_plan" "main" {
  name = "${var.name_prefix}-daily"

  rule {
    rule_name         = "daily"
    target_vault_name = aws_backup_vault.main.name
    schedule          = var.backup_schedule

    start_window      = 60
    completion_window = 180

    lifecycle {
      delete_after = var.backup_delete_after_days
    }
  }
}

resource "aws_backup_selection" "data" {
  iam_role_arn = aws_iam_role.backup.arn
  name         = "${var.name_prefix}-data-selection"
  plan_id      = aws_backup_plan.main.id
  resources    = local.backup_resources

  condition {
    string_equals {
      key   = "aws:ResourceTag/Project"
      value = var.project
    }
  }
}
