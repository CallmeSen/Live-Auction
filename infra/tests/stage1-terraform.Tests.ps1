$repoRoot = Split-Path -Parent $PSScriptRoot
$modules = @('04-data', '05-messaging', '06-compute')
$requiredFiles = @(
    'backend.tf',
    'versions.tf',
    'providers.tf',
    'variables.tf',
    'main.tf',
    'outputs.tf'
)

Describe 'Stage 1 Terraform module skeletons' {
    foreach ($module in $modules) {
        Context $module {
            foreach ($file in $requiredFiles) {
                It "contains $file" {
                    Test-Path -LiteralPath (Join-Path $repoRoot "$module\$file") |
                        Should Be $true
                }
            }

            It 'locks Terraform and AWS provider versions' {
                $versions = Get-Content -Raw -LiteralPath `
                    (Join-Path $repoRoot "$module\versions.tf")

                $versions | Should Match 'required_version\s*=\s*">= 1\.7, < 2\.0"'
                $versions | Should Match 'source\s*=\s*"hashicorp/aws"'
                $versions | Should Match 'version\s*=\s*"~> 6\.55\.0"'
            }

            It 'uses the shared region and default tags' {
                $provider = Get-Content -Raw -LiteralPath `
                    (Join-Path $repoRoot "$module\providers.tf")

                $provider | Should Match 'region\s*=\s*var\.aws_region'
                $provider | Should Match 'default_tags'
                $provider | Should Match 'Project\s*=\s*var\.project'
                $provider | Should Match 'Environment\s*=\s*var\.environment'
                $provider | Should Match 'ManagedBy\s*=\s*"terraform"'
                $provider | Should Match 'Owner\s*=\s*var\.owner'
            }

            It 'declares the shared naming variables' {
                $variables = Get-Content -Raw -LiteralPath `
                    (Join-Path $repoRoot "$module\variables.tf")

                foreach ($name in @(
                    'aws_region',
                    'project',
                    'environment',
                    'name_prefix',
                    'owner'
                )) {
                    $variables | Should Match "variable\s+`"$name`""
                }
            }
        }
    }
}

Describe 'Stage 1 Terraform backend isolation' {
    It 'uses one unique state key per module without placeholder account IDs' {
        $keys = foreach ($module in $modules) {
            $backend = Get-Content -Raw -LiteralPath `
                (Join-Path $repoRoot "$module\backend.tf")

            $backend | Should Not Match '111122223333|<account-id>' | Out-Null
            [regex]::Match($backend, 'key\s*=\s*"([^"]+)"').Groups[1].Value
        }

        ($keys | Sort-Object -Unique).Count | Should Be $modules.Count
        (@($keys) -contains '04-data/terraform.tfstate') | Should Be $true
        (@($keys) -contains '05-messaging/terraform.tfstate') | Should Be $true
        (@($keys) -contains '06-compute/terraform.tfstate') | Should Be $true
    }
}

Describe 'Stage 1 DynamoDB data module' {
    BeforeEach {
        $script:dataMain = Get-Content -Raw -LiteralPath `
            (Join-Path $repoRoot '04-data\main.tf')
        $script:dataOutputs = Get-Content -Raw -LiteralPath `
            (Join-Path $repoRoot '04-data\outputs.tf')
    }

    It 'derives all table names from the shared prefix' {
        foreach ($suffix in @(
            'item_auction_state',
            'bid_events',
            'websocket_connections',
            'item_bidder_aliases',
            'idempotency'
        )) {
            $dataMain | Should Match "`\$`{var\.name_prefix`}_$suffix"
        }
    }

    It 'defines the item state table with stream, PITR and managed encryption' {
        $dataMain | Should Match 'resource\s+"aws_dynamodb_table"\s+"item_auction_state"'
        $dataMain | Should Match 'stream_view_type\s*=\s*"NEW_AND_OLD_IMAGES"'
        $dataMain | Should Match 'point_in_time_recovery\s*\{\s*enabled\s*=\s*true'
        $dataMain | Should Match 'server_side_encryption\s*\{\s*enabled\s*=\s*true'
    }

    It 'defines the bid events table with its range key and stream' {
        $dataMain | Should Match 'resource\s+"aws_dynamodb_table"\s+"bid_events"'
        $dataMain | Should Match 'range_key\s*=\s*"sk"'
        $dataMain | Should Match 'stream_view_type\s*=\s*"NEW_IMAGE"'
    }

    It 'defines WebSocket, alias and idempotency key contracts' {
        $dataMain | Should Match 'resource\s+"aws_dynamodb_table"\s+"websocket_connections"'
        $dataMain | Should Match 'range_key\s*=\s*"connection_id"'
        $dataMain | Should Match 'attribute_name\s*=\s*"ttl"'
        $dataMain | Should Match 'resource\s+"aws_dynamodb_table"\s+"item_bidder_aliases"'
        $dataMain | Should Match 'range_key\s*=\s*"user_id"'
        $dataMain | Should Match 'resource\s+"aws_dynamodb_table"\s+"idempotency"'
        $dataMain | Should Match 'attribute_name\s*=\s*"expiration"'
    }

    It 'does not enable customer KMS keys or Tokyo replicas in Stage 1' {
        $dataMain | Should Not Match 'kms_key_arn'
        $dataMain | Should Not Match 'replica\s*\{'
        $dataMain | Should Not Match 'ap-northeast-1'
    }

    It 'exports names and ARNs for all tables plus both stream ARNs' {
        foreach ($output in @(
            'item_state_table_name',
            'item_state_table_arn',
            'item_state_stream_arn',
            'bid_events_table_name',
            'bid_events_table_arn',
            'bid_events_stream_arn',
            'websocket_connections_table_name',
            'websocket_connections_table_arn',
            'bidder_aliases_table_name',
            'bidder_aliases_table_arn',
            'idempotency_table_name',
            'idempotency_table_arn'
        )) {
            $dataOutputs | Should Match "output\s+`"$output`""
        }
    }
}

Describe 'Stage 1 SQS messaging module' {
    BeforeEach {
        $script:messagingMain = Get-Content -Raw -LiteralPath `
            (Join-Path $repoRoot '05-messaging\main.tf')
        $script:messagingVariables = Get-Content -Raw -LiteralPath `
            (Join-Path $repoRoot '05-messaging\variables.tf')
        $script:messagingOutputs = Get-Content -Raw -LiteralPath `
            (Join-Path $repoRoot '05-messaging\outputs.tf')
    }

    It 'declares retention, visibility and redrive controls' {
        foreach ($name in @(
            'message_retention_seconds',
            'dlq_message_retention_seconds',
            'visibility_timeout_seconds',
            'max_receive_count'
        )) {
            $messagingVariables | Should Match "variable\s+`"$name`""
        }
    }

    It 'defines a FIFO DLQ with 14-day retention and managed encryption' {
        $messagingMain | Should Match 'resource\s+"aws_sqs_queue"\s+"bid_dlq"'
        $messagingMain | Should Match 'bid-commands-dlq\.fifo'
        $messagingMain | Should Match 'fifo_queue\s*=\s*true'
        $messagingMain | Should Match 'message_retention_seconds\s*=\s*var\.dlq_message_retention_seconds'
        $messagingMain | Should Match 'sqs_managed_sse_enabled\s*=\s*true'
    }

    It 'defines the FIFO bid queue with per-group throughput' {
        $messagingMain | Should Match 'resource\s+"aws_sqs_queue"\s+"bid_commands"'
        $messagingMain | Should Match 'bid-commands\.fifo'
        $messagingMain | Should Match 'content_based_deduplication\s*=\s*false'
        $messagingMain | Should Match 'deduplication_scope\s*=\s*"messageGroup"'
        $messagingMain | Should Match 'fifo_throughput_limit\s*=\s*"perMessageGroupId"'
        $messagingMain | Should Match 'visibility_timeout_seconds\s*=\s*var\.visibility_timeout_seconds'
    }

    It 'redrives failed messages to the DLQ after the configured count' {
        $messagingMain | Should Match 'deadLetterTargetArn\s*=\s*aws_sqs_queue\.bid_dlq\.arn'
        $messagingMain | Should Match 'maxReceiveCount\s*=\s*var\.max_receive_count'
    }

    It 'keeps later-stage scheduler resources disabled by default' {
        $messagingMain | Should Not Match 'kms_master_key_id'
        $messagingVariables | Should Match `
            '(?s)variable\s+"enable_stage3"\s*\{.*?default\s*=\s*false.*?\}'

        $schedulerResources = @([regex]::Matches(
            $messagingMain,
            '(?ms)^resource\s+"aws_scheduler_[^"]+"\s+"[^"]+"\s*\{(?<body>.*?)(?=^\})'
        ))
        $schedulerResources.Count | Should BeGreaterThan 0
        foreach ($resource in $schedulerResources) {
            $resource.Groups['body'].Value | Should Match `
                'count\s*=\s*var\.enable_stage3\s*\?\s*1\s*:\s*0'
        }
    }

    It 'exports command queue and DLQ URLs and ARNs' {
        foreach ($output in @(
            'bid_commands_queue_url',
            'bid_commands_queue_arn',
            'bid_commands_dlq_url',
            'bid_commands_dlq_arn'
        )) {
            $messagingOutputs | Should Match "output\s+`"$output`""
        }
    }
}
