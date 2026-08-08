$repoRoot = Split-Path -Parent $PSScriptRoot
$modules = @('10-observability', '11-security', '12-backup-dr')
$requiredFiles = @(
    'backend.tf',
    'versions.tf',
    'providers.tf',
    'variables.tf',
    'main.tf',
    'outputs.tf'
)

function Read-Module([string]$Module, [string]$File) {
    $path = Join-Path $repoRoot "$Module\$File"
    if (-not (Test-Path -LiteralPath $path)) {
        return ''
    }
    return Get-Content -Raw -LiteralPath $path
}

Describe 'Stage 6 Terraform module skeletons' {
    foreach ($module in $modules) {
        Context $module {
            foreach ($file in $requiredFiles) {
                It "contains $file" {
                    Test-Path -LiteralPath (Join-Path $repoRoot "$module\$file") |
                        Should Be $true
                }
            }

            It 'locks Terraform and the AWS provider' {
                $versions = Read-Module $module 'versions.tf'

                $versions | Should Match 'required_version\s*=\s*">= 1\.7, < 2\.0"'
                $versions | Should Match 'source\s*=\s*"hashicorp/aws"'
                $versions | Should Match 'version\s*=\s*"~> 6\.55\.0"'
            }

            It 'uses the Singapore region and shared tags' {
                $provider = Read-Module $module 'providers.tf'
                $variables = Read-Module $module 'variables.tf'

                $provider | Should Match 'region\s*=\s*var\.aws_region'
                $provider | Should Match 'default_tags'
                $provider | Should Match 'Project\s*=\s*var\.project'
                $provider | Should Match 'Environment\s*=\s*var\.environment'
                $provider | Should Match 'ManagedBy\s*=\s*"terraform"'
                $provider | Should Match 'Owner\s*=\s*var\.owner'
                $variables | Should Match 'variable\s+"aws_region"'
                $variables | Should Match 'default\s*=\s*"ap-southeast-1"'
            }

            It 'does not contain credentials or root usage' {
                $all = ($requiredFiles | ForEach-Object {
                    Read-Module $module $_
                }) -join "`n"

                $all | Should Not Match '(?i)access_key\s*=|secret_key\s*=|profile\s*=\s*"root"|root credentials'
            }
        }
    }
}

Describe 'Stage 6 observability contract' {
    BeforeEach {
        $script:main = Read-Module '10-observability' 'main.tf'
        $script:variables = Read-Module '10-observability' 'variables.tf'
    }

    It 'publishes alarm notifications through optional SNS email subscription' {
        $main | Should Match 'resource\s+"aws_sns_topic"\s+"alarms"'
        $main | Should Match 'resource\s+"aws_sns_topic_subscription"\s+"email"'
        $main | Should Match 'var\.sns_alarm_email'
        $variables | Should Match 'variable\s+"sns_alarm_email"'
    }

    It 'alarms on custom bid metrics, Lambda errors, and both DLQs' {
        foreach ($pattern in @(
            'aws_cloudwatch_metric_alarm.*rejected_bid',
            'aws_cloudwatch_metric_alarm.*bid_latency',
            'aws_cloudwatch_metric_alarm.*lambda_errors',
            'aws_cloudwatch_metric_alarm.*bid_dlq',
            'aws_cloudwatch_metric_alarm.*scheduler_dlq',
            'LiveAuction',
            'RejectedBid',
            'BidLatency',
            'ApproximateNumberOfMessagesVisible'
        )) {
            $main | Should Match $pattern
        }
    }

    It 'defines an operator dashboard and avoids out-of-design analytics infrastructure' {
        $main | Should Match 'resource\s+"aws_cloudwatch_dashboard"\s+"main"'
        $main | Should Not Match '(?i)kinesis|analytics_worker|aws_vpc|aws_subnet|aws_ecs'
    }
}

Describe 'Stage 6 security and backup contract' {
    BeforeEach {
        $script:security = Read-Module '11-security' 'main.tf'
        $script:backup = Read-Module '12-backup-dr' 'main.tf'
    }

    It 'creates tamper-evident multi-region CloudTrail storage' {
        $security | Should Match 'aws_cloudtrail.*main'
        $security | Should Match 'is_multi_region_trail\s*=\s*true'
        $security | Should Match 'enable_log_file_validation\s*=\s*true'
        $security | Should Match 'aws_s3_bucket_public_access_block'
        $security | Should Match 'aws_s3_bucket_versioning'
    }

    It 'connects AWS Config evidence to IAM Access Analyzer policy validation' {
        foreach ($pattern in @(
            'aws_config_configuration_recorder',
            'aws_config_delivery_channel',
            'aws_config_configuration_recorder_status',
            'aws_accessanalyzer_analyzer',
            'type\s*=\s*"ACCOUNT"'
        )) {
            $security | Should Match $pattern
        }
        $security | Should Not Match '(?i)securityhub|cis-aws-foundations-benchmark'
        $security | Should Not Match '(?i)aws_vpc|aws_subnet|aws_ecs|aws_rds_cluster'
    }

    It 'defines an AWS Backup vault, plan, selection, and scoped role' {
        foreach ($pattern in @(
            'aws_backup_vault',
            'aws_backup_plan',
            'aws_backup_selection',
            'AWSBackupServiceRolePolicyForBackup',
            'aws_iam_role.*backup'
        )) {
            $backup | Should Match $pattern
        }
        $backup | Should Match 'terraform_remote_state.*data'
    }
}
