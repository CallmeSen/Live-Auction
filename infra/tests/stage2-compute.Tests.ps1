$repoRoot = Split-Path -Parent $PSScriptRoot
$moduleRoot = Join-Path $repoRoot '06-compute'
$mainPath = Join-Path $moduleRoot 'main.tf'
$variablesPath = Join-Path $moduleRoot 'variables.tf'
$outputsPath = Join-Path $moduleRoot 'outputs.tf'

function Remove-HclComments([string]$Text) {
    $result = New-Object System.Text.StringBuilder
    $inString = $false
    $escaped = $false
    $lineComment = $false
    $blockComment = $false

    for ($index = 0; $index -lt $Text.Length; $index++) {
        $current = $Text[$index]
        $next = if ($index + 1 -lt $Text.Length) {
            $Text[$index + 1]
        }
        else {
            [char]0
        }

        if ($lineComment) {
            if ($current -eq "`r" -or $current -eq "`n") {
                $lineComment = $false
                [void]$result.Append($current)
            }
            continue
        }
        if ($blockComment) {
            if ($current -eq '*' -and $next -eq '/') {
                $blockComment = $false
                $index++
            }
            elseif ($current -eq "`r" -or $current -eq "`n") {
                [void]$result.Append($current)
            }
            continue
        }
        if (-not $inString -and $current -eq '#') {
            $lineComment = $true
            continue
        }
        if (-not $inString -and $current -eq '/' -and $next -eq '/') {
            $lineComment = $true
            $index++
            continue
        }
        if (-not $inString -and $current -eq '/' -and $next -eq '*') {
            $blockComment = $true
            $index++
            continue
        }

        [void]$result.Append($current)
        if ($current -eq '"' -and -not $escaped) {
            $inString = -not $inString
        }
        if ($inString -and $current -eq '\' -and -not $escaped) {
            $escaped = $true
        }
        else {
            $escaped = $false
        }
    }
    return $result.ToString()
}

function Read-Hcl([string]$Path) {
    return Remove-HclComments (Get-Content -Raw -LiteralPath $Path)
}

function Get-HclBlock([string]$Text, [string]$HeaderPattern) {
    $match = [regex]::Match($Text, "$HeaderPattern\s*\{")
    if (-not $match.Success) {
        return ''
    }

    $openBrace = $Text.IndexOf('{', $match.Index)
    $depth = 0
    $inString = $false
    $escaped = $false
    for ($index = $openBrace; $index -lt $Text.Length; $index++) {
        $current = $Text[$index]
        if ($current -eq '"' -and -not $escaped) {
            $inString = -not $inString
        }
        if (-not $inString) {
            if ($current -eq '{') {
                $depth++
            }
            elseif ($current -eq '}') {
                $depth--
                if ($depth -eq 0) {
                    return $Text.Substring(
                        $match.Index,
                        $index - $match.Index + 1
                    )
                }
            }
        }
        if ($inString -and $current -eq '\' -and -not $escaped) {
            $escaped = $true
        }
        else {
            $escaped = $false
        }
    }
    return ''
}

function Get-HclBlocks([string]$Text, [string]$HeaderPattern) {
    $blocks = @()
    foreach ($match in [regex]::Matches($Text, "$HeaderPattern\s*\{")) {
        $tail = $Text.Substring($match.Index)
        $block = Get-HclBlock $tail $HeaderPattern
        if ($block) {
            $blocks += $block
        }
    }
    return $blocks
}

function Get-PolicyStatement([string]$Policy, [string]$Sid) {
    foreach ($statement in (Get-HclBlocks $Policy 'statement')) {
        if ($statement -match "sid\s*=\s*`"$Sid`"") {
            return $statement
        }
    }
    return ''
}

function Assert-ExactActions([string]$Statement, [string[]]$Expected) {
    $pattern = '"((?:logs|dynamodb|sqs|execute-api|lambda|cloudwatch):[^"]+)"'
    $actual = @([regex]::Matches($Statement, $pattern) | ForEach-Object {
        $_.Groups[1].Value
    })

    ($actual | Sort-Object) -join '|' |
        Should Be (($Expected | Sort-Object) -join '|')
}

$main = Read-Hcl $mainPath
$variables = Read-Hcl $variablesPath
$outputs = Read-Hcl $outputsPath

Describe 'Stage 2 compute state and rollout inputs' {
    It 'reads identity from the bootstrap state region' {
        $identity = Get-HclBlock $main `
            'data\s+"terraform_remote_state"\s+"identity"'

        $identity | Should Match 'key\s*=\s*"03-identity/terraform\.tfstate"'
        $identity | Should Match 'region\s*=\s*"ap-southeast-1"'
    }

    It 'keeps every remote state read in the backend region' {
        foreach ($name in @('data', 'messaging', 'identity')) {
            $state = Get-HclBlock $main `
                "data\s+`"terraform_remote_state`"\s+`"$name`""
            $state | Should Match 'region\s*=\s*"ap-southeast-1"'
        }
    }

    It 'defines the two-pass endpoint and broadcast defaults' {
        $endpoint = Get-HclBlock $variables `
            'variable\s+"ws_management_endpoint"'
        $broadcast = Get-HclBlock $variables `
            'variable\s+"enable_broadcast"'

        $endpoint | Should Match 'type\s*=\s*string'
        $endpoint | Should Match 'default\s*=\s*""'
        $broadcast | Should Match 'type\s*=\s*bool'
        $broadcast | Should Match 'default\s*=\s*false'
    }
}

Describe 'Stage 2 realtime Lambda resources' {
    It 'declares deterministic names and build archives' {
        foreach ($name in @('ws_authorizer', 'ws_handler', 'broadcast')) {
            $main | Should Match "$name\s*=\s*`"\$\{var\.name_prefix\}-$($name -replace '_', '-')`""
            $main | Should Match "$name\.zip"
        }
    }

    It 'creates a role, policy, log group, and function per realtime handler' {
        foreach ($name in @('ws_authorizer', 'ws_handler', 'broadcast')) {
            foreach ($type in @(
                'aws_iam_role',
                'aws_iam_role_policy',
                'aws_cloudwatch_log_group',
                'aws_lambda_function'
            )) {
                $main | Should Match "resource\s+`"$type`"\s+`"$name`""
            }
        }
    }

    It 'uses the shared Lambda-only trust policy' {
        $trust = Get-HclBlock $main `
            'data\s+"aws_iam_policy_document"\s+"lambda_assume_role"'

        $trust | Should Match 'actions\s*=\s*\["sts:AssumeRole"\]'
        $trust | Should Match 'type\s*=\s*"Service"'
        $trust | Should Match 'identifiers\s*=\s*\["lambda\.amazonaws\.com"\]'
    }

    It 'uses the Python 3.13 artifact and finite log contract' {
        foreach ($name in @('ws_authorizer', 'ws_handler', 'broadcast')) {
            $function = Get-HclBlock $main `
                "resource\s+`"aws_lambda_function`"\s+`"$name`""
            $log = Get-HclBlock $main `
                "resource\s+`"aws_cloudwatch_log_group`"\s+`"$name`""

            $function | Should Match 'runtime\s*=\s*"python3\.13"'
            $function | Should Match 'architectures\s*=\s*\["x86_64"\]'
            $function | Should Match 'handler\s*=\s*"handler\.handler"'
            $function | Should Match 'source_code_hash\s*=\s*filebase64sha256'
            $function | Should Match 'aws_lambda_layer_version\.common\.arn'
            $log | Should Match 'retention_in_days\s*=\s*var\.log_retention_days'
        }
        $main | Should Not Match 'vpc_config|reserved_concurrent_executions'
    }
}

Describe 'Stage 2 realtime environment contracts' {
    It 'configures the authorizer with Cognito verification inputs' {
        $function = Get-HclBlock $main `
            'resource\s+"aws_lambda_function"\s+"ws_authorizer"'

        $function | Should Match 'COGNITO_JWKS_URL\s*=\s*data\.terraform_remote_state\.identity\.outputs\.cognito_jwks_url'
        $function | Should Match 'COGNITO_ISSUER\s*=\s*data\.terraform_remote_state\.identity\.outputs\.cognito_issuer'
        $function | Should Match 'COGNITO_CLIENT_ID\s*=\s*data\.terraform_remote_state\.identity\.outputs\.cognito_client_id'
    }

    It 'configures the route handler with its data, queue, and endpoint inputs' {
        $function = Get-HclBlock $main `
            'resource\s+"aws_lambda_function"\s+"ws_handler"'

        foreach ($pattern in @(
            'TBL_ITEM_STATE\s*=\s*data\.terraform_remote_state\.data\.outputs\.item_state_table_name',
            'TBL_BID_EVENTS\s*=\s*data\.terraform_remote_state\.data\.outputs\.bid_events_table_name',
            'TBL_WS_CONN\s*=\s*data\.terraform_remote_state\.data\.outputs\.websocket_connections_table_name',
            'TBL_ALIASES\s*=\s*data\.terraform_remote_state\.data\.outputs\.bidder_aliases_table_name',
            'BID_QUEUE_URL\s*=\s*data\.terraform_remote_state\.messaging\.outputs\.bid_commands_queue_url',
            'OWNER_REGION\s*=\s*var\.aws_region',
            'WS_MGMT_ENDPOINT\s*=\s*var\.ws_management_endpoint'
        )) {
            $function | Should Match $pattern
        }
    }

    It 'configures broadcast with room and endpoint inputs' {
        $function = Get-HclBlock $main `
            'resource\s+"aws_lambda_function"\s+"broadcast"'

        $function | Should Match 'TBL_WS_CONN\s*=\s*data\.terraform_remote_state\.data\.outputs\.websocket_connections_table_name'
        $function | Should Match 'OWNER_REGION\s*=\s*var\.aws_region'
        $function | Should Match 'WS_MGMT_ENDPOINT\s*=\s*var\.ws_management_endpoint'
    }
}

Describe 'Stage 2 least-privilege policies' {
    It 'grants the authorizer only scoped log writes' {
        $policy = Get-HclBlock $main `
            'data\s+"aws_iam_policy_document"\s+"ws_authorizer"'
        $logs = Get-PolicyStatement $policy 'WriteFunctionLogs'

        (Get-HclBlocks $policy 'statement').Count | Should Be 1
        Assert-ExactActions $logs @(
            'logs:CreateLogStream',
            'logs:PutLogEvents'
        )
        $logs | Should Match 'aws_cloudwatch_log_group\.ws_authorizer\.arn'
        $policy | Should Not Match 'dynamodb:|sqs:|execute-api:|lambda:'
    }

    It 'grants the handler only required DynamoDB, SQS, and connection actions' {
        $policy = Get-HclBlock $main `
            'data\s+"aws_iam_policy_document"\s+"ws_handler"'
        $connections = Get-PolicyStatement $policy 'ManageConnectionRecords'
        $aliases = Get-PolicyStatement $policy 'ManageBidderAliases'
        $state = Get-PolicyStatement $policy 'ReadAuctionState'
        $queue = Get-PolicyStatement $policy 'EnqueueBidCommands'
        $delivery = Get-PolicyStatement $policy 'ManageWebSocketConnections'

        (Get-HclBlocks $policy 'statement').Count | Should Be 6

        Assert-ExactActions $connections @(
            'dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:DeleteItem',
            'dynamodb:UpdateItem', 'dynamodb:TransactWriteItems'
        )
        $connections | Should Match 'resources\s*=\s*\[data\.terraform_remote_state\.data\.outputs\.websocket_connections_table_arn\]'

        Assert-ExactActions $aliases @(
            'dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem'
        )
        $aliases | Should Match 'resources\s*=\s*\[data\.terraform_remote_state\.data\.outputs\.bidder_aliases_table_arn\]'

        Assert-ExactActions $state @('dynamodb:GetItem')
        $state | Should Match 'resources\s*=\s*\[data\.terraform_remote_state\.data\.outputs\.item_state_table_arn\]'
        Assert-ExactActions $queue @('sqs:SendMessage')
        $queue | Should Match 'resources\s*=\s*\[data\.terraform_remote_state\.messaging\.outputs\.bid_commands_queue_arn\]'
        Assert-ExactActions $delivery @('execute-api:ManageConnections')
        $delivery | Should Match 'resources\s*=\s*\[local\.ws_manage_connections_arn\]'

        $logs = Get-PolicyStatement $policy 'WriteFunctionLogs'
        Assert-ExactActions $logs @(
            'logs:CreateLogStream', 'logs:PutLogEvents'
        )
        $logs | Should Match 'resources\s*=\s*\["\$\{aws_cloudwatch_log_group\.ws_handler\.arn\}:\*"\]'
    }

    It 'grants broadcast only room query, cleanup, logs, and delivery' {
        $policy = Get-HclBlock $main `
            'data\s+"aws_iam_policy_document"\s+"broadcast"'
        $rooms = Get-PolicyStatement $policy 'ReadAndCleanRoomConnections'
        $delivery = Get-PolicyStatement $policy 'ManageWebSocketConnections'

        (Get-HclBlocks $policy 'statement').Count | Should Be 3

        Assert-ExactActions $rooms @('dynamodb:Query', 'dynamodb:DeleteItem')
        $rooms | Should Match 'resources\s*=\s*\[data\.terraform_remote_state\.data\.outputs\.websocket_connections_table_arn\]'
        Assert-ExactActions $delivery @('execute-api:ManageConnections')
        $delivery | Should Match 'resources\s*=\s*\[local\.ws_manage_connections_arn\]'
        $logs = Get-PolicyStatement $policy 'WriteFunctionLogs'
        Assert-ExactActions $logs @(
            'logs:CreateLogStream', 'logs:PutLogEvents'
        )
        $logs | Should Match 'resources\s*=\s*\["\$\{aws_cloudwatch_log_group\.broadcast\.arn\}:\*"\]'
        $policy | Should Not Match 'dynamodb:PutItem|dynamodb:UpdateItem|sqs:|lambda:'
    }

    It 'contains no wildcard action and scopes connection resources' {
        $main | Should Not Match 'actions\s*=\s*\[\s*"\*"\s*\]'
        $main | Should Not Match 'actions\s*=\s*"\*"'
        $main | Should Not Match '(?i)"(dynamodb|sqs|logs|lambda|execute-api):\*"'
        $main | Should Match 'ws_manage_connections_arn\s*=\s*"arn:\$\{data\.aws_partition\.current\.partition\}:execute-api:\$\{var\.aws_region\}:\$\{data\.aws_caller_identity\.current\.account_id\}:\*/\*/POST/@connections/\*"'
    }
}

Describe 'Stage 2 bid processor handoff and outputs' {
    It 'gates broadcast invocation without changing the SQS source of truth' {
        $processor = Get-HclBlock $main `
            'resource\s+"aws_lambda_function"\s+"bid_processor"'
        $policy = Get-HclBlock $main `
            'data\s+"aws_iam_policy_document"\s+"bid_processor"'
        $invoke = Get-PolicyStatement $policy 'InvokeBroadcast'

        $processor | Should Match 'BROADCAST_FN_NAME\s*=\s*var\.enable_broadcast\s*\?\s*local\.broadcast_function_name\s*:\s*""'
        Assert-ExactActions $invoke @('lambda:InvokeFunction')
        $invoke | Should Match 'resources\s*=\s*\[local\.broadcast_function_arn\]'
        (Get-HclBlocks $policy 'statement').Count | Should Be 7
        $main | Should Match 'resource\s+"aws_lambda_event_source_mapping"\s+"bid"'
        $main | Should Match 'function_response_types\s*=\s*\["ReportBatchItemFailures"\]'
        $main | Should Match 'maximum_concurrency\s*=\s*10'
    }

    It 'preserves the Stage 1 processor, role, layer, logs, and environment' {
        foreach ($resource in @(
            'resource\s+"aws_iam_role"\s+"bid_processor"',
            'resource\s+"aws_iam_role_policy"\s+"bid_processor"',
            'resource\s+"aws_cloudwatch_log_group"\s+"bid_processor"',
            'resource\s+"aws_lambda_layer_version"\s+"common"',
            'resource\s+"aws_lambda_function"\s+"bid_processor"'
        )) {
            $main | Should Match $resource
        }
        $processor = Get-HclBlock $main `
            'resource\s+"aws_lambda_function"\s+"bid_processor"'
        $role = Get-HclBlock $main `
            'resource\s+"aws_iam_role"\s+"bid_processor"'
        $rolePolicy = Get-HclBlock $main `
            'resource\s+"aws_iam_role_policy"\s+"bid_processor"'
        $log = Get-HclBlock $main `
            'resource\s+"aws_cloudwatch_log_group"\s+"bid_processor"'
        $layer = Get-HclBlock $main `
            'resource\s+"aws_lambda_layer_version"\s+"common"'
        $mapping = Get-HclBlock $main `
            'resource\s+"aws_lambda_event_source_mapping"\s+"bid"'

        $role | Should Match 'name\s*=\s*local\.role_name'
        $role | Should Match 'assume_role_policy\s*=\s*data\.aws_iam_policy_document\.lambda_assume_role\.json'
        $rolePolicy | Should Match 'role\s*=\s*aws_iam_role\.bid_processor\.id'
        $rolePolicy | Should Match 'policy\s*=\s*data\.aws_iam_policy_document\.bid_processor\.json'
        $log | Should Match 'name\s*=\s*local\.log_group'
        $log | Should Match 'retention_in_days\s*=\s*var\.log_retention_days'
        $layer | Should Match 'filename\s*=\s*"\$\{path\.module\}/\.\./\.\./backend/build/layer\.zip"'
        $layer | Should Match 'compatible_runtimes\s*=\s*\["python3\.13"\]'
        $layer | Should Match 'compatible_architectures\s*=\s*\["x86_64"\]'
        $processor | Should Match 'role\s*=\s*aws_iam_role\.bid_processor\.arn'
        $processor | Should Match 'runtime\s*=\s*"python3\.13"'
        $processor | Should Match 'handler\s*=\s*"handler\.handler"'
        $processor | Should Match 'filename\s*=\s*local\.function_archive'
        $processor | Should Match 'layers\s*=\s*\[aws_lambda_layer_version\.common\.arn\]'
        foreach ($name in @(
            'TBL_ITEM_STATE', 'TBL_BID_EVENTS', 'TBL_IDEMPOTENCY',
            'BID_QUEUE_URL', 'OWNER_REGION', 'POWERTOOLS_METRICS_NAMESPACE'
        )) {
            $processor | Should Match $name
        }
        $mapping | Should Match 'event_source_arn\s*=\s*data\.terraform_remote_state\.messaging\.outputs\.bid_commands_queue_arn'
        $mapping | Should Match 'function_name\s*=\s*aws_lambda_function\.bid_processor\.arn'
        $mapping | Should Match 'batch_size\s*=\s*10'

        $stage1Outputs = @{
            bid_processor_function_name  = 'aws_lambda_function\.bid_processor\.function_name'
            bid_processor_function_arn   = 'aws_lambda_function\.bid_processor\.arn'
            bid_processor_role_arn       = 'aws_iam_role\.bid_processor\.arn'
            bid_processor_log_group_name = 'aws_cloudwatch_log_group\.bid_processor\.name'
            bid_event_source_mapping_uuid = 'aws_lambda_event_source_mapping\.bid\.uuid'
        }
        foreach ($name in $stage1Outputs.Keys) {
            $block = Get-HclBlock $outputs "output\s+`"$name`""
            $block | Should Match "value\s*=\s*$($stage1Outputs[$name])"
        }
    }

    It 'exports the realtime names, ARNs, invokes, roles, and logs' {
        $expectedOutputs = @{
            common_layer_arn = 'aws_lambda_layer_version\.common\.arn'
        }
        foreach ($name in @('ws_authorizer', 'ws_handler', 'broadcast')) {
            $expectedOutputs["${name}_function_name"] = "aws_lambda_function\.$name\.function_name"
            $expectedOutputs["${name}_function_arn"] = "aws_lambda_function\.$name\.arn"
            $expectedOutputs["${name}_invoke_arn"] = "aws_lambda_function\.$name\.invoke_arn"
            $expectedOutputs["${name}_role_arn"] = "aws_iam_role\.$name\.arn"
            $expectedOutputs["${name}_log_group_name"] = "aws_cloudwatch_log_group\.$name\.name"
        }
        foreach ($name in $expectedOutputs.Keys) {
            $block = Get-HclBlock $outputs "output\s+`"$name`""
            $block | Should Match "value\s*=\s*$($expectedOutputs[$name])"
        }
    }
}
