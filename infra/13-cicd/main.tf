data "aws_partition" "current" {}
data "aws_caller_identity" "current" {}

data "terraform_remote_state" "compute" {
  backend = "s3"

  config = {
    bucket         = "la-tfstate-233376973052"
    key            = "06-compute/terraform.tfstate"
    region         = "ap-southeast-1"
    dynamodb_table = "la-tflock"
    encrypt        = true
  }
}

locals {
  artifact_bucket_name  = var.artifact_bucket_name != "" ? var.artifact_bucket_name : "${var.name_prefix}-cicd-artifacts-${data.aws_caller_identity.current.account_id}"
  function_arn          = data.terraform_remote_state.compute.outputs.bid_processor_function_arn
  codebuild_log_group   = "/aws/codebuild/${var.build_project_name}"
  codedeploy_app_arn    = "arn:${data.aws_partition.current.partition}:codedeploy:${var.aws_region}:${data.aws_caller_identity.current.account_id}:application:${var.codedeploy_app_name}"
  deployment_group_arn  = "arn:${data.aws_partition.current.partition}:codedeploy:${var.aws_region}:${data.aws_caller_identity.current.account_id}:deploymentgroup:${var.codedeploy_app_name}/${var.deployment_group_name}"
  deployment_config_arn = "arn:${data.aws_partition.current.partition}:codedeploy:${var.aws_region}:${data.aws_caller_identity.current.account_id}:deploymentconfig:${var.deployment_config_name}"
}

resource "aws_s3_bucket" "artifacts" {
  bucket        = local.artifact_bucket_name
  force_destroy = false
}

resource "aws_s3_bucket_ownership_controls" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "artifacts" {
  bucket                  = aws_s3_bucket.artifacts.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  rule {
    id     = "expire-old-artifacts"
    status = "Enabled"

    filter {}

    expiration {
      days = 30
    }

    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }
}

resource "aws_codestarconnections_connection" "github" {
  name          = var.connection_name
  provider_type = "GitHub"
}

resource "aws_lambda_alias" "bid_processor_live" {
  name             = var.function_alias_name
  description      = "Stable production alias managed by CodeDeploy"
  function_name    = var.function_name
  function_version = var.initial_function_version

  lifecycle {
    # CodeDeploy owns traffic shifting after the initial alias is created.
    ignore_changes = [function_version]
  }
}

data "aws_iam_policy_document" "service_assume" {
  for_each = toset(["codebuild", "codepipeline", "codedeploy"])

  statement {
    effect = "Allow"

    actions = ["sts:AssumeRole"]

    principals {
      type = "Service"
      identifiers = [
        "${each.key}.amazonaws.com",
      ]
    }
  }
}

resource "aws_iam_role" "codebuild" {
  name               = "${var.name_prefix}-codebuild-role"
  assume_role_policy = data.aws_iam_policy_document.service_assume["codebuild"].json
}

resource "aws_iam_role" "codepipeline" {
  name               = "${var.name_prefix}-codepipeline-role"
  assume_role_policy = data.aws_iam_policy_document.service_assume["codepipeline"].json
}

resource "aws_iam_role" "codedeploy" {
  name               = "${var.name_prefix}-codedeploy-role"
  assume_role_policy = data.aws_iam_policy_document.service_assume["codedeploy"].json
}

resource "aws_iam_role_policy_attachment" "codedeploy_lambda" {
  role       = aws_iam_role.codedeploy.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/service-role/AWSCodeDeployRoleForLambda"
}

resource "aws_cloudwatch_log_group" "codebuild" {
  name              = local.codebuild_log_group
  retention_in_days = 14
}

data "aws_iam_policy_document" "codebuild" {
  statement {
    sid    = "WriteBuildLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["${aws_cloudwatch_log_group.codebuild.arn}:*"]
  }

  statement {
    sid    = "ReadWritePipelineArtifacts"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:GetObjectVersion",
      "s3:PutObject",
      "s3:GetBucketVersioning",
    ]
    resources = [
      aws_s3_bucket.artifacts.arn,
      "${aws_s3_bucket.artifacts.arn}/*",
    ]
  }

  statement {
    sid    = "PublishBidProcessorVersion"
    effect = "Allow"
    actions = [
      "lambda:GetAlias",
      "lambda:GetFunction",
      "lambda:GetFunctionConfiguration",
      "lambda:PublishVersion",
      "lambda:UpdateFunctionCode",
    ]
    resources = [local.function_arn]
  }
}

resource "aws_iam_role_policy" "codebuild" {
  name   = "${var.name_prefix}-codebuild-inline"
  role   = aws_iam_role.codebuild.id
  policy = data.aws_iam_policy_document.codebuild.json
}

resource "aws_codebuild_project" "build" {
  name         = var.build_project_name
  service_role = aws_iam_role.codebuild.arn

  source {
    type      = "CODEPIPELINE"
    buildspec = "buildspec.cicd.yml"
  }

  artifacts {
    type = "CODEPIPELINE"
  }

  environment {
    compute_type                = "BUILD_GENERAL1_MEDIUM"
    image                       = "aws/codebuild/amazonlinux-x86_64-standard:6.0"
    type                        = "LINUX_CONTAINER"
    privileged_mode             = false
    image_pull_credentials_type = "CODEBUILD"

    environment_variable {
      name  = "FUNCTION_NAME"
      value = var.function_name
    }

    environment_variable {
      name  = "ALIAS_NAME"
      value = var.function_alias_name
    }
  }

  logs_config {
    cloudwatch_logs {
      group_name  = aws_cloudwatch_log_group.codebuild.name
      stream_name = "build"
    }
  }

  depends_on = [aws_iam_role_policy.codebuild]
}

resource "aws_codedeploy_app" "lambda" {
  name             = var.codedeploy_app_name
  compute_platform = "Lambda"
}

resource "aws_codedeploy_deployment_group" "bid_processor" {
  app_name               = aws_codedeploy_app.lambda.name
  deployment_group_name  = var.deployment_group_name
  service_role_arn       = aws_iam_role.codedeploy.arn
  deployment_config_name = var.deployment_config_name

  deployment_style {
    deployment_type   = "BLUE_GREEN"
    deployment_option = "WITH_TRAFFIC_CONTROL"
  }

  alarm_configuration {
    enabled = true
    alarms  = [var.alarm_name]
  }

  auto_rollback_configuration {
    enabled = true
    events  = ["DEPLOYMENT_FAILURE", "DEPLOYMENT_STOP_ON_ALARM"]
  }
}

data "aws_iam_policy_document" "codepipeline" {
  statement {
    sid    = "UseGitHubConnection"
    effect = "Allow"
    actions = [
      "codestar-connections:UseConnection",
    ]
    resources = [aws_codestarconnections_connection.github.arn]
  }

  statement {
    sid    = "UseArtifactStore"
    effect = "Allow"
    actions = [
      "s3:GetBucketVersioning",
      "s3:GetObject",
      "s3:GetObjectVersion",
      "s3:PutObject",
    ]
    resources = [
      aws_s3_bucket.artifacts.arn,
      "${aws_s3_bucket.artifacts.arn}/*",
    ]
  }

  statement {
    sid    = "RunBuild"
    effect = "Allow"
    actions = [
      "codebuild:BatchGetBuilds",
      "codebuild:StartBuild",
    ]
    resources = [aws_codebuild_project.build.arn]
  }

  statement {
    sid    = "RunLambdaDeployment"
    effect = "Allow"
    actions = [
      "codedeploy:CreateDeployment",
      "codedeploy:GetApplication",
      "codedeploy:GetApplicationRevision",
      "codedeploy:GetDeployment",
      "codedeploy:GetDeploymentConfig",
      "codedeploy:GetDeploymentGroup",
      "codedeploy:RegisterApplicationRevision",
    ]
    resources = [
      local.codedeploy_app_arn,
      local.deployment_group_arn,
      local.deployment_config_arn,
    ]
  }

  statement {
    sid       = "PassBuildAndDeployRoles"
    effect    = "Allow"
    actions   = ["iam:PassRole"]
    resources = [aws_iam_role.codebuild.arn, aws_iam_role.codedeploy.arn]

    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["codebuild.amazonaws.com", "codedeploy.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy" "codepipeline" {
  name   = "${var.name_prefix}-codepipeline-policy"
  role   = aws_iam_role.codepipeline.id
  policy = data.aws_iam_policy_document.codepipeline.json
}

resource "aws_codepipeline" "main" {
  name           = var.pipeline_name
  role_arn       = aws_iam_role.codepipeline.arn
  pipeline_type  = "V2"
  execution_mode = "QUEUED"

  artifact_store {
    location = aws_s3_bucket.artifacts.bucket
    type     = "S3"
  }

  stage {
    name = "Source"

    action {
      name             = "GitHub"
      category         = "Source"
      owner            = "AWS"
      provider         = "CodeStarSourceConnection"
      version          = "1"
      output_artifacts = ["source_output"]

      configuration = {
        ConnectionArn        = aws_codestarconnections_connection.github.arn
        FullRepositoryId     = var.full_repository_id
        BranchName           = var.branch_name
        OutputArtifactFormat = "CODE_ZIP"
      }
    }
  }

  stage {
    name = "Build"

    action {
      name             = "Build"
      category         = "Build"
      owner            = "AWS"
      provider         = "CodeBuild"
      version          = "1"
      input_artifacts  = ["source_output"]
      output_artifacts = ["build_output"]

      configuration = {
        ProjectName = aws_codebuild_project.build.name
      }
    }
  }

  stage {
    name = "Deploy"

    action {
      name            = "LambdaCanary"
      category        = "Deploy"
      owner           = "AWS"
      provider        = "CodeDeployToLambda"
      version         = "1"
      input_artifacts = ["build_output"]

      configuration = {
        ApplicationName     = aws_codedeploy_app.lambda.name
        DeploymentGroupName = aws_codedeploy_deployment_group.bid_processor.deployment_group_name
      }
    }
  }

  depends_on = [aws_iam_role_policy.codepipeline]
}
