$repoRoot = Split-Path -Parent $PSScriptRoot
$main = Get-Content -Raw -LiteralPath (Join-Path $repoRoot '06-compute\main.tf')
$outputs = Get-Content -Raw -LiteralPath (Join-Path $repoRoot '06-compute\outputs.tf')

Describe 'Stage 1 Lambda compute contract' {
    It 'reads data and messaging outputs from remote state' {
        $main | Should Match 'terraform_remote_state.*data'
        $main | Should Match 'terraform_remote_state.*messaging'
        $main | Should Match 'outputs\.item_state_table_name'
        $main | Should Match 'outputs\.bid_events_table_name'
        $main | Should Match 'outputs\.bid_commands_queue_url'
        $main | Should Match 'outputs\.bid_commands_queue_arn'
    }

    It 'creates only the Stage 1 Lambda resources' {
        foreach ($resource in @(
            'aws_iam_role" "bid_processor',
            'aws_iam_role_policy" "bid_processor',
            'aws_cloudwatch_log_group" "bid_processor',
            'aws_lambda_layer_version" "common',
            'aws_lambda_function" "bid_processor',
            'aws_lambda_event_source_mapping" "bid'
        )) {
            $main | Should Match $resource
        }

        $main | Should Not Match 'aws_scheduler_|aws_rds_|aws_db_|aws_vpc|aws_apigateway|aws_cognito'
        $main | Should Not Match 'ap-northeast-1|111122223333|<account-id>'
    }

    It 'uses Lambda-only trust and least privilege action lists' {
        $main | Should Match 'type\s*=\s*"Service"'
        $main | Should Match 'identifiers\s*=\s*\["lambda\.amazonaws\.com"\]'
        $main | Should Match 'sqs:ReceiveMessage'
        $main | Should Match 'sqs:DeleteMessage'
        $main | Should Match 'dynamodb:GetItem'
        $main | Should Match 'dynamodb:UpdateItem'
        $main | Should Match 'dynamodb:Query'
        $main | Should Match 'dynamodb:PutItem'
        $main | Should Match 'logs:PutLogEvents'
        $main | Should Match 'cloudwatch:PutMetricData'
        $main | Should Not Match 'Action\s*=\s*"\*"'
        $main | Should Not Match 'Action\s*=\s*\[\s*"\*"\s*\]'
    }

    It 'matches the Linux build artifact and Lambda environment contract' {
        $main | Should Match 'runtime\s*=\s*"python3\.13"'
        $main | Should Match 'architectures\s*=\s*\["x86_64"\]'
        $main | Should Match 'compatible_architectures\s*=\s*\["x86_64"\]'
        $main | Should Match 'handler\s*=\s*"handler\.handler"'
        $main | Should Match 'filename\s*=\s*"\$\{path\.module\}/\.\./\.\./backend/build/layer\.zip"'
        $main | Should Match 'source_code_hash\s*=\s*filebase64sha256'
        $main | Should Match 'TBL_ITEM_STATE'
        $main | Should Match 'TBL_BID_EVENTS'
        $main | Should Match 'OWNER_REGION'
        $main | Should Match 'POWERTOOLS_METRICS_NAMESPACE'
        $main | Should Not Match 'DB_SECRET_ARN|RDS_PROXY_HOST|vpc_config'
    }

    It 'configures FIFO SQS partial failures and bounded concurrency' {
        $main | Should Match 'function_response_types\s*=\s*\["ReportBatchItemFailures"\]'
        $main | Should Match 'batch_size\s*=\s*10'
        $main | Should Not Match 'maximum_batching_window_in_seconds'
        $main | Should Match 'maximum_concurrency\s*=\s*10'
        $main | Should Not Match 'reserved_concurrent_executions'
    }

    It 'exports function, role, layer, log group and mapping identifiers' {
        foreach ($output in @(
            'bid_processor_function_name',
            'bid_processor_function_arn',
            'bid_processor_role_arn',
            'common_layer_arn',
            'bid_processor_log_group_name',
            'bid_event_source_mapping_uuid'
        )) {
            $outputs | Should Match "output\s+`"$output`""
        }
    }
}
