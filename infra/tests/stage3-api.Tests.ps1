$repoRoot = Split-Path -Parent $PSScriptRoot
$moduleRoot = Join-Path $repoRoot '07-api'
$workspaceRoot = Split-Path -Parent $repoRoot
$planPath = Join-Path $workspaceRoot `
    'docs\live-auction-planning\live-auction-stage-3-serverless-control-plane-implementation-plan.md'
$planRaw = Get-Content -Raw -LiteralPath $planPath

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
    $offset = 0
    while ($offset -lt $Text.Length) {
        $tail = $Text.Substring($offset)
        $match = [regex]::Match($tail, "$HeaderPattern\s*\{")
        if (-not $match.Success) {
            break
        }
        $absolute = $offset + $match.Index
        $block = Get-HclBlock $Text.Substring($absolute) $HeaderPattern
        if (-not $block) {
            break
        }
        $blocks += $block
        $offset = $absolute + $block.Length
    }
    return $blocks
}

function Get-HclAssignmentValue([string]$Text, [string]$Name) {
    $match = [regex]::Match(
        $Text,
        '(?m)^\s*' + [regex]::Escape($Name) + '\s*='
    )
    if (-not $match.Success) {
        return ''
    }

    $start = $match.Index + $match.Length
    while ($start -lt $Text.Length -and [char]::IsWhiteSpace($Text[$start])) {
        $start++
    }
    if ($start -ge $Text.Length) {
        return ''
    }

    if ($Text[$start] -eq '"') {
        $escaped = $false
        for ($index = $start + 1; $index -lt $Text.Length; $index++) {
            $current = $Text[$index]
            if ($current -eq '"' -and -not $escaped) {
                return $Text.Substring($start, $index - $start + 1)
            }
            if ($current -eq '\' -and -not $escaped) {
                $escaped = $true
            }
            else {
                $escaped = $false
            }
        }
        return ''
    }

    $closingFor = @{
        '[' = ']'
        '{' = '}'
        '(' = ')'
    }
    $scanStart = $start
    if (-not $closingFor.ContainsKey([string]$Text[$scanStart])) {
        $function = [regex]::Match(
            $Text.Substring($start),
            '^[A-Za-z_][A-Za-z0-9_]*\s*\('
        )
        if ($function.Success) {
            $scanStart = $start + $function.Value.IndexOf('(')
        }
    }
    if ($closingFor.ContainsKey([string]$Text[$scanStart])) {
        $stack = New-Object 'System.Collections.Generic.Stack[char]'
        $inString = $false
        $escaped = $false
        for ($index = $scanStart; $index -lt $Text.Length; $index++) {
            $current = $Text[$index]
            if ($current -eq '"' -and -not $escaped) {
                $inString = -not $inString
            }
            elseif (-not $inString) {
                if ($closingFor.ContainsKey([string]$current)) {
                    $stack.Push([char]$closingFor[[string]$current])
                }
                elseif ($stack.Count -gt 0 -and $current -eq $stack.Peek()) {
                    [void]$stack.Pop()
                    if ($stack.Count -eq 0) {
                        return $Text.Substring($start, $index - $start + 1)
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

    $end = $start
    while ($end -lt $Text.Length -and $Text[$end] -notin @("`r", "`n")) {
        $end++
    }
    return $Text.Substring($start, $end - $start).Trim()
}

function Normalize-HclExpression([string]$Text) {
    return [regex]::Replace($Text, '\s+', '')
}

function Get-RootAddresses([string]$Text) {
    return @([regex]::Matches(
        $Text,
        '(resource|data)\s+"([^"]+)"\s+"([^"]+)"\s*\{'
    ) | ForEach-Object {
        "$($_.Groups[1].Value).$($_.Groups[2].Value)." +
            $_.Groups[3].Value
    })
}

function Test-SecureOperationTemplate([string]$Text) {
    $normalized = Normalize-HclExpression $Text
    return (
        $normalized -match 'security=\[\{cognito=\[\],?api_key=\[\]\}\]' -and
        $normalized -match 'type="aws_proxy"' -and
        $normalized -match 'httpMethod="POST"' -and
        $normalized -match (
            'uri=lookup\(local\.stage3_function_invoke_arns,' +
            'function_name,null\)'
        )
    )
}

function Test-OptionsTemplate([string]$Text) {
    $normalized = Normalize-HclExpression $Text
    return (
        $normalized -match 'security=\[\]' -and
        $normalized -match 'type="aws_proxy"' -and
        $normalized -match 'httpMethod="POST"' -and
        $normalized -match (
            'uri=lookup\(local\.stage3_function_invoke_arns,' +
            '"query_service",null\)'
        )
    )
}

function Test-ApiKeySecurityScheme([string]$Text) {
    $scheme = Get-HclBlock $Text 'api_key\s*='
    return (
        (Get-HclAssignmentValue $scheme 'type') -eq '"apiKey"' -and
        (Get-HclAssignmentValue $scheme 'name') -ceq '"x-api-key"' -and
        (Get-HclAssignmentValue $scheme 'in') -eq '"header"'
    )
}

$terraformFiles = @(Get-ChildItem -LiteralPath $moduleRoot -Filter '*.tf' -File |
    Sort-Object FullName)
$terraformJsonFiles = @(Get-ChildItem -LiteralPath $moduleRoot `
    -Filter '*.tf.json' -File)
$terraformSources = @($terraformFiles | ForEach-Object {
    [pscustomobject]@{
        Name = $_.Name
        Text = Get-Content -Raw -LiteralPath $_.FullName
    }
})
$raw = ($terraformSources.Text) -join "`n"
$all = Remove-HclComments $raw
$nonStage3 = Remove-HclComments ((
    $terraformSources | Where-Object { $_.Name -ne 'stage3.tf' }
).Text -join "`n")
$main = Remove-HclComments (Get-Content -Raw -LiteralPath `
    (Join-Path $moduleRoot 'main.tf'))
$variables = Remove-HclComments (Get-Content -Raw -LiteralPath `
    (Join-Path $moduleRoot 'variables.tf'))
$outputs = Remove-HclComments (Get-Content -Raw -LiteralPath `
    (Join-Path $moduleRoot 'outputs.tf'))
$stage3Path = Join-Path $moduleRoot 'stage3.tf'
$stage3 = if (Test-Path -LiteralPath $stage3Path) {
    Remove-HclComments (Get-Content -Raw -LiteralPath $stage3Path)
}
else {
    ''
}
$stage3Raw = if (Test-Path -LiteralPath $stage3Path) {
    Get-Content -Raw -LiteralPath $stage3Path
}
else {
    ''
}

$functionNames = @(
    'session_service',
    'item_service',
    'query_service',
    'admin_command'
)
$expectedRoutes = [ordered]@{
    '/api/v1/users/me' = 'GET="query_service"'
    '/api/v1/auction-sessions' = 'GET="query_service",POST="session_service"'
    '/api/v1/auction-sessions/mine' = 'GET="query_service"'
    '/api/v1/auction-sessions/{session_id}' = 'GET="query_service"'
    '/api/v1/auction-sessions/{session_id}/rules' = 'PUT="session_service"'
    '/api/v1/auction-sessions/{session_id}/items' = 'POST="item_service"'
    '/api/v1/auction-sessions/{session_id}/schedule' = 'POST="admin_command"'
    '/api/v1/auction-items' = 'GET="query_service"'
    '/api/v1/auction-items/{item_id}' = 'GET="query_service"'
    '/api/v1/auction-items/{item_id}/images/presign' = 'POST="item_service"'
    '/api/v1/bids/my' = 'GET="query_service"'
    '/api/v1/admin/items/{item_id}/pause' = 'POST="admin_command"'
    '/api/v1/admin/items/{item_id}/resume' = 'POST="admin_command"'
    '/api/v1/admin/items/{item_id}/approve' = 'POST="admin_command"'
    '/api/v1/admin/items/{item_id}/close' = 'POST="admin_command"'
    '/api/v1/admin/items/{item_id}/cancel' = 'POST="admin_command"'
    '/api/v1/admin/dashboard' = 'GET="admin_command"'
    '/api/v1/admin/auction-sessions' = 'GET="admin_command"'
    '/api/v1/admin/auction-sessions/{session_id}' = 'GET="admin_command"'
    '/api/v1/admin/auction-sessions/{session_id}/approve' = 'POST="admin_command"'
    '/api/v1/admin/auction-sessions/{session_id}/reject' = 'POST="admin_command"'
    '/api/v1/admin/auction-sessions/{session_id}/cancel' = 'POST="admin_command"'
    '/api/v1/admin/auction-sessions/{session_id}/close' = 'POST="admin_command"'
    '/api/v1/admin/users' = 'GET="admin_command"'
    '/api/v1/admin/users/{user_id}' = 'GET="admin_command"'
    '/api/v1/admin/users/{user_id}/status' = 'PATCH="admin_command"'
    '/api/v1/admin/admin-accounts' = 'GET="admin_command",POST="admin_command"'
    '/api/v1/admin/admin-accounts/{user_id}/status' = 'PATCH="admin_command"'
    '/api/v1/admin/admin-accounts/{user_id}/reset-invitation' = 'POST="admin_command"'
    '/api/v1/admin/categories' = 'GET="admin_command",POST="admin_command"'
    '/api/v1/admin/categories/{category_id}' = 'PATCH="admin_command"'
    '/api/v1/admin/categories/{category_id}/archive' = 'POST="admin_command"'
    '/api/v1/admin/audit-events' = 'GET="admin_command"'
    '/api/v1/categories' = 'GET="query_service"'
    '/api/v1/categories/{category_id}' = 'GET="query_service"'
}
$expectedCachePaths = @(
    '/api/v1/auction-sessions',
    '/api/v1/auction-items'
)
$legacyAddresses = @(
    'data.terraform_remote_state.compute',
    'resource.aws_apigatewayv2_api.websocket',
    'resource.aws_apigatewayv2_authorizer.connect',
    'resource.aws_apigatewayv2_integration.ws_handler',
    'resource.aws_apigatewayv2_route.connect',
    'resource.aws_apigatewayv2_route.disconnect',
    'resource.aws_apigatewayv2_route.join_room',
    'resource.aws_apigatewayv2_route.place_bid',
    'resource.aws_apigatewayv2_stage.websocket',
    'resource.aws_lambda_permission.ws_authorizer',
    'resource.aws_lambda_permission.ws_handler'
)
$stage3Addresses = @(
    'data.terraform_remote_state.identity',
    'data.terraform_remote_state.stage3_compute',
    'data.aws_iam_policy_document.api_gateway_assume_role',
    'data.aws_iam_policy_document.api_gateway_logs',
    'resource.aws_api_gateway_rest_api.stage3',
    'resource.aws_api_gateway_gateway_response.default_4xx',
    'resource.aws_api_gateway_gateway_response.default_5xx',
    'resource.aws_api_gateway_deployment.stage3',
    'resource.aws_api_gateway_stage.stage3',
    'resource.aws_api_gateway_method_settings.default',
    'resource.aws_api_gateway_method_settings.cache',
    'resource.aws_api_gateway_api_key.stage3',
    'resource.aws_api_gateway_usage_plan.stage3',
    'resource.aws_api_gateway_usage_plan_key.stage3',
    'resource.aws_iam_role.api_gateway_cloudwatch',
    'resource.aws_iam_role_policy.api_gateway_cloudwatch',
    'resource.aws_cloudwatch_log_group.stage3_access',
    'resource.aws_api_gateway_account.stage3',
    'resource.aws_lambda_permission.session_service_rest',
    'resource.aws_lambda_permission.item_service_rest',
    'resource.aws_lambda_permission.query_service_rest',
    'resource.aws_lambda_permission.admin_command_rest'
)

Describe 'Stage 3 REST API inputs and dependencies' {
    It 'creates an isolated Stage 3 file and defaults its gate to false' {
        Test-Path -LiteralPath $stage3Path | Should Be $true
        $gate = Get-HclBlock $variables 'variable\s+"enable_stage3"'

        $gate | Should Match 'type\s*=\s*bool'
        $gate | Should Match 'default\s*=\s*false'
    }

    It 'pins the API root backend and provider to la-admin' {
        $backend = Remove-HclComments (Get-Content -Raw -LiteralPath `
            (Join-Path $moduleRoot 'backend.tf'))
        $providers = Remove-HclComments (Get-Content -Raw -LiteralPath `
            (Join-Path $moduleRoot 'providers.tf'))

        $backend | Should Match 'profile\s*=\s*"la-admin"'
        $providers | Should Match 'profile\s*=\s*"la-admin"'
        $providers | Should Match 'allowed_account_ids\s*=\s*\["233376973052"\]'
    }

    It 'retains the legacy compute state only for Stage 2 WebSocket outputs' {
        $compute = Get-HclBlock $main `
            'data\s+"terraform_remote_state"\s+"compute"'

        $compute | Should Match 'backend\s*=\s*"s3"'
        $compute | Should Match `
            'key\s*=\s*"06-compute/terraform\.tfstate"'
        $compute | Should Match 'region\s*=\s*"ap-southeast-1"'
        $compute | Should Not Match '\bcount\s*='
        foreach ($output in @(
            'ws_authorizer_invoke_arn',
            'ws_authorizer_function_name',
            'ws_handler_invoke_arn',
            'ws_handler_function_name'
        )) {
            $main | Should Match (
                'data\.terraform_remote_state\.compute\.outputs\.' + $output
            )
        }
        $main | Should Not Match (
            'stage3_compute|stage3_functions|' +
            'stage3_cors_allowed_origin'
        )
    }

    It 'reads identity and isolated compute only when Stage 3 is enabled' {
        $identity = Get-HclBlock $all `
            'data\s+"terraform_remote_state"\s+"identity"'
        $compute = Get-HclBlock $stage3 `
            'data\s+"terraform_remote_state"\s+"stage3_compute"'

        foreach ($state in @($identity, $compute)) {
            $state | Should Match `
                'count\s*=\s*var\.enable_stage3\s*\?\s*1\s*:\s*0'
            $state | Should Match 'backend\s*=\s*"s3"'
            $state | Should Match 'region\s*=\s*"ap-southeast-1"'
            $state | Should Match 'bucket\s*=\s*"la-tfstate-233376973052"'
            $state | Should Match 'dynamodb_table\s*=\s*"la-tflock"'
            $state | Should Match 'encrypt\s*=\s*true'
        }
        $identity | Should Match 'key\s*=\s*"03-identity/terraform\.tfstate"'
        $compute | Should Match (
            'key\s*=\s*"06-compute/stage3-control-plane/' +
            'terraform\.tfstate"'
        )
        $stage3 | Should Match `
            'data\.terraform_remote_state\.identity\[0\]\.outputs\.cognito_user_pool_arn'
    }

    It 'uses only isolated compute state for functions and CORS origin' {
        $locals = Get-HclBlock $stage3 'locals'

        $locals | Should Match `
            'data\.terraform_remote_state\.stage3_compute\[0\]\.outputs\.stage3_functions'
        $locals | Should Match `
            'data\.terraform_remote_state\.stage3_compute\[0\]\.outputs\.stage3_cors_allowed_origin'
        $stage3 | Should Not Match `
            'data\.terraform_remote_state\.compute\.outputs\.stage3_'
        (Get-HclAssignmentValue $locals 'stage3_cors_allowed_origin') |
            Should Match 'var\.enable_stage3\s*\?'
        $stage3 | Should Not Match `
            'variable\s+"stage3_cors_allowed_origin"|default\s*=\s*"\*"'
    }

    It 'guards every dependency-derived local for disabled and missing state shapes' {
        $dependencyFunctions = Get-HclAssignmentValue $stage3 `
            'stage3_dependency_functions'
        $functionNames = Get-HclAssignmentValue $stage3 `
            'stage3_function_names'
        $invokeArns = Get-HclAssignmentValue $stage3 `
            'stage3_function_invoke_arns'
        $origin = Get-HclAssignmentValue $stage3 `
            'stage3_cors_allowed_origin'
        $identityArn = Get-HclAssignmentValue $stage3 `
            'stage3_identity_user_pool_arn'
        $paths = Get-HclAssignmentValue $stage3 'stage3_openapi_paths'
        $options = Get-HclAssignmentValue $stage3 `
            'stage3_options_operation'
        $document = Get-HclAssignmentValue $stage3 'stage3_openapi_document'
        $gatewayCors = Get-HclAssignmentValue $stage3 `
            'stage3_gateway_cors_response_parameters'
        $invokeUrl = Get-HclAssignmentValue $stage3 'stage3_invoke_url'

        foreach ($expression in @(
            $dependencyFunctions,
            $functionNames,
            $invokeArns,
            $origin,
            $identityArn,
            $options,
            $document,
            $gatewayCors,
            $invokeUrl
        )) {
            $expression.Length | Should BeGreaterThan 0
            $expression | Should Match 'var\.enable_stage3\s*\?'
        }
        foreach ($expression in @(
            $dependencyFunctions,
            $functionNames,
            $invokeArns
        )) {
            (Normalize-HclExpression $expression) | Should Match ':\{\}\)?$'
        }
        foreach ($expression in @(
            $origin,
            $identityArn,
            $options,
            $document,
            $gatewayCors,
            $invokeUrl
        )) {
            (Normalize-HclExpression $expression) | Should Match ':null\)?$'
        }

        $dependencyFunctions | Should Match 'try\('
        $functionNames | Should Match `
            'lookup\(local\.stage3_dependency_functions,\s*name,\s*null\)'
        $invokeArns | Should Match `
            'lookup\(local\.stage3_dependency_functions,\s*name,\s*null\)'
        $origin | Should Match `
            'try\(data\.terraform_remote_state\.stage3_compute\[0\]\.outputs\.stage3_cors_allowed_origin,\s*null\)'
        $identityArn | Should Match `
            'try\(data\.terraform_remote_state\.identity\[0\]\.outputs\.cognito_user_pool_arn,\s*null\)'
        $paths.Length | Should BeGreaterThan 0
        $paths | Should Match 'if\s+var\.enable_stage3'
        $paths | Should Match `
            'lookup\(local\.stage3_function_invoke_arns,\s*function_name,\s*null\)'
        $stage3Raw | Should Not Match 'responseOverride\.header'
        $document | Should Match 'local\.stage3_identity_user_pool_arn'
        $gatewayCors | Should Match `
            'coalesce\(local\.stage3_cors_allowed_origin,\s*""\)'
        $invokeUrl | Should Match 'try\('

        $safe = 'var.enable_stage3 ? try(state.outputs.stage3_functions, {}) : {}'
        $safe | Should Match '^var\.enable_stage3\s*\?.*try\(.*:\s*\{\}$'
        foreach ($mutation in @(
            'try(state.outputs.stage3_functions, {})',
            'var.enable_stage3 ? state.outputs.stage3_functions : {}',
            'var.enable_stage3 ? try(state.outputs.stage3_functions, {}) : null'
        )) {
            $mutation | Should Not Match `
                '^var\.enable_stage3\s*\?.*try\(.*:\s*\{\}$'
        }
    }

    It 'fails enabled dependency drift with one clear exact-shape precondition' {
        $locals = Get-HclBlock $stage3 'locals'
        $required = Get-HclAssignmentValue $locals `
            'stage3_required_function_names'
        $ready = Get-HclAssignmentValue $stage3 'stage3_dependencies_ready'
        $dependencyError = Get-HclAssignmentValue $stage3 `
            'stage3_dependency_error'
        $rest = Get-HclBlock $stage3 `
            'resource\s+"aws_api_gateway_rest_api"\s+"stage3"'

        foreach ($name in $functionNames) {
            $required | Should Match ('"' + $name + '"')
        }
        ([regex]::Matches($ready, 'setsubtract\(')).Count | Should Be 2
        $ready | Should Match 'keys\(local\.stage3_dependency_functions\)'
        $ready | Should Match 'local\.stage3_cors_allowed_origin\s*!=\s*null'
        $ready | Should Match 'local\.stage3_identity_user_pool_arn\s*!=\s*null'
        $rest | Should Match 'precondition\s*\{'
        $rest | Should Match `
            'condition\s*=\s*local\.stage3_dependencies_ready'
        $rest | Should Match `
            'error_message\s*=\s*local\.stage3_dependency_error'
        $dependencyError | Should Match (
            '"[^"\r\n]*session_service[^"\r\n]*' +
            'item_service[^"\r\n]*query_service[^"\r\n]*' +
            'admin_command[^"\r\n]*(?:CORS|origin)[^"\r\n]*"'
        )
    }

    It 'defines validated cache quota and throttling controls with approved defaults' {
        $cacheSize = Get-HclBlock $variables `
            'variable\s+"stage3_cache_cluster_size"'
        $cacheTtl = Get-HclBlock $variables `
            'variable\s+"stage3_cache_ttl_seconds"'
        $dailyQuota = Get-HclBlock $variables `
            'variable\s+"stage3_daily_quota_limit"'
        $burst = Get-HclBlock $variables `
            'variable\s+"stage3_throttling_burst_limit"'
        $rate = Get-HclBlock $variables `
            'variable\s+"stage3_throttling_rate_limit"'

        $cacheSize | Should Match 'type\s*=\s*string'
        $cacheSize | Should Match 'default\s*=\s*"0\.5"'
        foreach ($size in @('0.5', '1.6', '6.1', '13.5', '28.4', '58.2', '118', '237')) {
            $cacheSize | Should Match ('"' + [regex]::Escape($size) + '"')
        }
        $cacheSize | Should Match 'contains\('
        $cacheSize | Should Match 'var\.stage3_cache_cluster_size'
        $cacheSize | Should Match 'error_message\s*=\s*"[^"\r\n]+"'

        foreach ($spec in @(
            @($cacheTtl, 'stage3_cache_ttl_seconds', '60', '1', '3600'),
            @($dailyQuota, 'stage3_daily_quota_limit', '10000', '1', '1000000'),
            @($burst, 'stage3_throttling_burst_limit', '100', '1', '5000')
        )) {
            $block, $name, $default, $minimum, $maximum = $spec
            $block | Should Match 'type\s*=\s*number'
            $block | Should Match ('default\s*=\s*' + $default)
            $block | Should Match (
                'floor\(var\.' + $name + '\)\s*==\s*var\.' + $name
            )
            $block | Should Match (
                'var\.' + $name + '\s*>=\s*' + $minimum
            )
            $block | Should Match (
                'var\.' + $name + '\s*<=\s*' + $maximum
            )
            $block | Should Match 'error_message\s*=\s*"[^"\r\n]+"'
        }

        $rate | Should Match 'type\s*=\s*number'
        $rate | Should Match 'default\s*=\s*50'
        $rate | Should Match 'var\.stage3_throttling_rate_limit\s*>\s*0'
        $rate | Should Match 'var\.stage3_throttling_rate_limit\s*<=\s*10000'
        $rate | Should Match 'error_message\s*=\s*"[^"\r\n]+"'
    }
}

Describe 'Stage 3 exact REST route and OpenAPI contract' {
    It 'defines exactly the approved paths and handler mappings' {
        $locals = Get-HclBlock $stage3 'locals'
        $routes = Get-HclAssignmentValue $locals 'stage3_routes'
        $actualPaths = @([regex]::Matches(
            $routes,
            '(?m)^\s*"(/api/v1/[^"]+)"\s*=\s*\{'
        ) | ForEach-Object { $_.Groups[1].Value })

        (($actualPaths | Sort-Object) -join '|') |
            Should Be (($expectedRoutes.Keys | Sort-Object) -join '|')
        foreach ($path in $expectedRoutes.Keys) {
            $match = [regex]::Match(
                $routes,
                [regex]::Escape('"' + $path + '"') + '\s*=\s*\{([^{}]+)\}'
            )
            $match.Success | Should Be $true
            (Normalize-HclExpression $match.Groups[1].Value) |
                Should Be $expectedRoutes[$path]
        }
    }

    It 'contains no HTTP bid mutation operation' {
        $routes = Get-HclAssignmentValue (Get-HclBlock $stage3 'locals') `
            'stage3_routes'

        $routes | Should Not Match `
            '(?is)"[^"]*/bids(?:/[^"\s]*)?"\s*=\s*\{[^}]*(?:POST|PUT|PATCH|DELETE)\s*='
    }

    It 'builds every real operation with Cognito and API key in one security requirement' {
        $locals = Get-HclBlock $stage3 'locals'
        $paths = Get-HclAssignmentValue $locals 'stage3_openapi_paths'

        $paths | Should Match `
            'for\s+path\s*,\s*methods\s+in\s+local\.stage3_routes'
        $paths | Should Match `
            'for\s+method\s*,\s*function_name\s+in\s+methods'
        (Test-SecureOperationTemplate $paths) | Should Be $true
    }

    It 'defines an unauthenticated non-keyed query-service OPTIONS proxy' {
        $locals = Get-HclBlock $stage3 'locals'
        $options = Get-HclAssignmentValue $locals 'stage3_options_operation'

        (Test-OptionsTemplate $options) | Should Be $true
        $options | Should Match 'name\s*=\s*"Origin"'
        (Get-HclAssignmentValue $locals 'stage3_cors_allowed_headers') |
            Should Be '"Content-Type,Authorization,X-Api-Key"'
        (Get-HclAssignmentValue $locals 'stage3_cors_allowed_methods') |
            Should Be '"GET,POST,PUT,PATCH,OPTIONS"'
        $options | Should Not Match 'cognito\s*=\s*\[\]|api_key\s*=\s*\[\]'
    }

    It 'passes browser origin to the Lambda CORS boundary' {
        $options = Get-HclAssignmentValue (Get-HclBlock $stage3 'locals') `
            'stage3_options_operation'

        $options | Should Match 'name\s*=\s*"Origin"\s+in\s*=\s*"header"'
        $options | Should Match 'query_service'
        $options | Should Not Match 'type\s*=\s*"mock"'
    }

    It 'defines Cognito and the exact lowercase x-api-key OpenAPI scheme' {
        $document = Get-HclAssignmentValue (Get-HclBlock $stage3 'locals') `
            'stage3_openapi_document'

        $document | Should Match 'openapi\s*=\s*"3\.0\.1"'
        $document | Should Match 'cognito\s*=\s*\{'
        $document | Should Match 'type\s*=\s*"cognito_user_pools"'
        $document | Should Match 'providerARNs\s*=\s*\['
        $document | Should Match 'name\s*=\s*"Authorization"'
        (Test-ApiKeySecurityScheme $document) | Should Be $true
        (Test-ApiKeySecurityScheme `
            $document.Replace('"X-Api-Key"', '"x-api-key"')) | Should Be $true
        (Test-ApiKeySecurityScheme `
            $document.Replace('"x-api-key"', '"X-Api-Key"')) | Should Be $false
    }

    It 'does not claim unsupported API-key-required extensions enforce methods' {
        $stage3 | Should Not Match 'x-amazon-apigateway-api-key-required'
    }

    It 'creates one gated REGIONAL REST API from the OpenAPI document' {
        $rest = Get-HclBlock $stage3 `
            'resource\s+"aws_api_gateway_rest_api"\s+"stage3"'

        $rest | Should Match `
            'count\s*=\s*var\.enable_stage3\s*\?\s*1\s*:\s*0'
        $rest | Should Match 'api_key_source\s*=\s*"HEADER"'
        $rest | Should Match 'put_rest_api_mode\s*=\s*"overwrite"'
        $rest | Should Match 'types\s*=\s*\["REGIONAL"\]'
        (Get-HclAssignmentValue $rest 'body') |
            Should Be 'jsonencode(local.stage3_openapi_document)'
    }
}

Describe 'Stage 3 CORS and browser-visible errors' {
    It 'adds the exact CORS headers to both default gateway error families' {
        $cors = Get-HclAssignmentValue (Get-HclBlock $stage3 'locals') `
            'stage3_gateway_cors_response_parameters'
        foreach ($name in @('default_4xx', 'default_5xx')) {
            $response = Get-HclBlock $stage3 (
                'resource\s+"aws_api_gateway_gateway_response"\s+"' +
                $name + '"'
            )
            $response | Should Match `
                'count\s*=\s*var\.enable_stage3\s*\?\s*1\s*:\s*0'
            $response | Should Match `
                'rest_api_id\s*=\s*aws_api_gateway_rest_api\.stage3\[0\]\.id'
            (Get-HclAssignmentValue $response 'response_parameters') |
                Should Be 'local.stage3_gateway_cors_response_parameters'
        }
        $cors | Should Match 'Access-Control-Allow-Origin'
        $cors | Should Match 'Access-Control-Allow-Headers'
        $cors | Should Match 'Access-Control-Allow-Methods'
        $cors | Should Match 'local\.stage3_cors_allowed_origin'
        $stage3 | Should Match 'response_type\s*=\s*"DEFAULT_4XX"'
        $stage3 | Should Match 'response_type\s*=\s*"DEFAULT_5XX"'
    }

    It 'preserves the exact JSON template for both default gateway errors' {
        $expected = `
            '{"application/json"="{\"message\":$context.error.messageString}"}'
        foreach ($name in @('default_4xx', 'default_5xx')) {
            $response = Get-HclBlock $stage3 (
                'resource\s+"aws_api_gateway_gateway_response"\s+"' +
                $name + '"'
            )
            $templates = Get-HclAssignmentValue $response 'response_templates'

            (Normalize-HclExpression $templates) | Should Be $expected
        }
    }

    It 'rejects auth API-key and CORS bypass mutation fixtures' {
        $secure = @'
security = [{ cognito = [], api_key = [] }]
x-amazon-apigateway-integration = {
  type = "aws_proxy"
  httpMethod = "POST"
  uri = lookup(local.stage3_function_invoke_arns, function_name, null)
}
'@
        (Test-SecureOperationTemplate $secure) | Should Be $true
        foreach ($mutation in @(
            $secure.Replace('cognito = [], ', ''),
            $secure.Replace(', api_key = []', ''),
            $secure.Replace(
                'security = [{ cognito = [], api_key = [] }]',
                'security = [{ cognito = [] }, { api_key = [] }]'
            ),
            $secure.Replace('type = "aws_proxy"', 'type = "http"'),
            $secure.Replace(
                'lookup(local.stage3_function_invoke_arns, function_name, null)',
                '"https://example.invalid"'
            )
        )) {
            (Test-SecureOperationTemplate $mutation) | Should Be $false
        }

        $options = @'
security = []
type = "aws_proxy"
httpMethod = "POST"
uri = lookup(local.stage3_function_invoke_arns, "query_service", null)
name = "Origin"
in = "header"
'@
        (Test-OptionsTemplate $options) | Should Be $true
        foreach ($required in @('type = "aws_proxy"', 'httpMethod = "POST"', 'query_service')) {
            (Test-OptionsTemplate $options.Replace($required, 'Removed')) |
                Should Be $false
        }
        (Test-OptionsTemplate $options.Replace('security = []', 'security = [{ cognito = [] }]')) |
            Should Be $false
    }
}

Describe 'Stage 3 deployment cache and traffic controls' {
    It 'redeploys on body or route changes and preserves the old deployment' {
        $deployment = Get-HclBlock $stage3 `
            'resource\s+"aws_api_gateway_deployment"\s+"stage3"'

        $deployment | Should Match `
            'count\s*=\s*var\.enable_stage3\s*\?\s*1\s*:\s*0'
        $deployment | Should Match (
            'sha1\(jsonencode\(\{\s*body\s*=\s*' +
            'aws_api_gateway_rest_api\.stage3\[0\]\.body\s*' +
            'routes\s*=\s*local\.stage3_routes\s*\}\)\)'
        )
        $deployment | Should Match 'create_before_destroy\s*=\s*true'
    }

    It 'creates a prod stage with a configurable encrypted cache and safe access logs' {
        $stage = Get-HclBlock $stage3 `
            'resource\s+"aws_api_gateway_stage"\s+"stage3"'

        $stage | Should Match `
            'count\s*=\s*var\.enable_stage3\s*\?\s*1\s*:\s*0'
        $stage | Should Match 'stage_name\s*=\s*"prod"'
        $stage | Should Match 'cache_cluster_enabled\s*=\s*true'
        $stage | Should Match `
            'cache_cluster_size\s*=\s*var\.stage3_cache_cluster_size'
        $stage | Should Match 'access_log_settings\s*\{'
        $stage | Should Match 'local\.stage3_access_log_format'
    }

    It 'disables default caching and caches only two safe collection GET paths' {
        $locals = Get-HclBlock $stage3 'locals'
        $cachePaths = Get-HclAssignmentValue $locals 'stage3_cache_paths'
        $actual = @([regex]::Matches(
            $cachePaths,
            '"(/api/v1/[^"]+)"'
        ) | ForEach-Object { $_.Groups[1].Value })

        (($actual | Sort-Object) -join '|') |
            Should Be (($expectedCachePaths | Sort-Object) -join '|')
        $cachePaths | Should Not Match `
            '/mine|/bids/my|\{session_id\}|\{item_id\}'

        $default = Get-HclBlock $stage3 `
            'resource\s+"aws_api_gateway_method_settings"\s+"default"'
        $default | Should Match 'method_path\s*=\s*"\*/\*"'
        $default | Should Match 'caching_enabled\s*=\s*false'
        $default | Should Match `
            'throttling_burst_limit\s*=\s*var\.stage3_throttling_burst_limit'
        $default | Should Match `
            'throttling_rate_limit\s*=\s*var\.stage3_throttling_rate_limit'

        $cache = Get-HclBlock $stage3 `
            'resource\s+"aws_api_gateway_method_settings"\s+"cache"'
        $cache | Should Match (
            'for_each\s*=\s*var\.enable_stage3\s*\?\s*' +
            'local\.stage3_cache_paths\s*:\s*toset\(\[\]\)'
        )
        $cache | Should Match `
            'method_path\s*=\s*"\$\{trim\(each\.value,\s*"/"\)\}/GET"'
        $cache | Should Match 'caching_enabled\s*=\s*true'
        $cache | Should Match `
            'cache_ttl_in_seconds\s*=\s*var\.stage3_cache_ttl_seconds'
        $cache | Should Match 'cache_data_encrypted\s*=\s*true'
        $cache | Should Match `
            'throttling_burst_limit\s*=\s*var\.stage3_throttling_burst_limit'
        $cache | Should Match `
            'throttling_rate_limit\s*=\s*var\.stage3_throttling_rate_limit'
    }

    It 'uses only supported collection query parameters as cache keys' {
        $keys = Get-HclAssignmentValue (Get-HclBlock $stage3 'locals') `
            'stage3_cache_key_parameters'

        foreach ($name in @(
            'method.request.querystring.status',
            'method.request.querystring.pageSize',
            'method.request.querystring.cursor',
            'method.request.querystring.sessionId',
            'method.request.querystring.categoryId'
        )) {
            $keys | Should Match ([regex]::Escape($name))
        }
        $keys | Should Not Match `
            'method\.request\.path\.|\{session_id\}|\{item_id\}'
        $paths = Get-HclAssignmentValue (Get-HclBlock $stage3 'locals') `
            'stage3_openapi_paths'
        $paths | Should Match `
            'cacheKeyParameters\s*=\s*lookup\(local\.stage3_cache_key_parameters'
    }

    It 'rejects cache allowlist mutations involving private or write routes' {
        $allowed = @($expectedCachePaths)
        ($allowed -contains '/api/v1/auction-sessions/mine') | Should Be $false
        ($allowed -contains '/api/v1/bids/my') | Should Be $false
        $mutations = @(
            , (@($allowed) + '/api/v1/auction-sessions/mine')
            , (@($allowed) + '/api/v1/bids/my')
            , (@($allowed) + '/api/v1/auction-sessions/{session_id}')
            , (@($allowed) + '/api/v1/auction-items/{item_id}')
            , (@($allowed) + '/api/v1/auction-sessions/{session_id}/items')
            , (@($allowed) + '/api/v1/admin/items/{item_id}/close')
        )
        foreach ($mutated in $mutations) {
            ($mutated.Count -eq 2 -and
                -not ($mutated -match (
                    '/mine|/bids/my|/admin/|\{session_id\}|\{item_id\}'
                ))) |
                Should Be $false
        }
    }

    It 'creates an account-qualified key and bounded daily usage plan' {
        $apiKey = Get-HclBlock $stage3 `
            'resource\s+"aws_api_gateway_api_key"\s+"stage3"'
        $plan = Get-HclBlock $stage3 `
            'resource\s+"aws_api_gateway_usage_plan"\s+"stage3"'
        $association = Get-HclBlock $stage3 `
            'resource\s+"aws_api_gateway_usage_plan_key"\s+"stage3"'

        $apiKey | Should Match `
            'name\s*=\s*"\$\{var\.name_prefix\}-\$\{var\.aws_account_id\}-rest-api-key"'
        $apiKey | Should Not Match '(?m)^\s*value\s*='
        $plan | Should Match 'quota_settings\s*\{'
        $plan | Should Match 'period\s*=\s*"DAY"'
        $plan | Should Match 'throttle_settings\s*\{'
        $plan | Should Not Match 'dynamic\s+"throttle"\s*\{'
        $plan | Should Not Match 'for_each\s*=\s*local\.stage3_operations'
        $plan | Should Match `
            'limit\s*=\s*var\.stage3_daily_quota_limit'
        ([regex]::Matches(
            $plan,
            'burst_limit\s*=\s*var\.stage3_throttling_burst_limit'
        )).Count | Should Be 1
        ([regex]::Matches(
            $plan,
            'rate_limit\s*=\s*var\.stage3_throttling_rate_limit'
        )).Count | Should Be 1
        $association | Should Match 'key_type\s*=\s*"API_KEY"'
        $association | Should Match 'aws_api_gateway_api_key\.stage3\[0\]\.id'
        $association | Should Match 'aws_api_gateway_usage_plan\.stage3\[0\]\.id'
    }
}

Describe 'Stage 3 API Gateway logging and invocation boundaries' {
    It 'creates a dedicated API Gateway CloudWatch role and account binding' {
        $assume = Get-HclBlock $stage3 `
            'data\s+"aws_iam_policy_document"\s+"api_gateway_assume_role"'
        $logs = Get-HclBlock $stage3 `
            'data\s+"aws_iam_policy_document"\s+"api_gateway_logs"'
        $role = Get-HclBlock $stage3 `
            'resource\s+"aws_iam_role"\s+"api_gateway_cloudwatch"'
        $policy = Get-HclBlock $stage3 `
            'resource\s+"aws_iam_role_policy"\s+"api_gateway_cloudwatch"'
        $account = Get-HclBlock $stage3 `
            'resource\s+"aws_api_gateway_account"\s+"stage3"'

        $assume | Should Match 'apigateway\.amazonaws\.com'
        $logs | Should Match 'logs:CreateLogStream'
        $logs | Should Match 'logs:PutLogEvents'
        $logs | Should Not Match '(?i)authorization|x-api-key'
        $role | Should Match 'data\.aws_iam_policy_document\.api_gateway_assume_role\[0\]\.json'
        $policy | Should Match 'data\.aws_iam_policy_document\.api_gateway_logs\[0\]\.json'
        $account | Should Match 'aws_iam_role\.api_gateway_cloudwatch\[0\]\.arn'
    }

    It 'uses finite access-log retention and a non-sensitive JSON format' {
        $group = Get-HclBlock $stage3 `
            'resource\s+"aws_cloudwatch_log_group"\s+"stage3_access"'
        $format = Get-HclAssignmentValue (Get-HclBlock $stage3 'locals') `
            'stage3_access_log_format'

        $group | Should Match 'retention_in_days\s*=\s*var\.log_retention_days'
        foreach ($context in @(
            '$context.requestId',
            '$context.httpMethod',
            '$context.resourcePath',
            '$context.status',
            '$context.responseLatency',
            '$context.authorizer.claims.sub'
        )) {
            $format | Should Match ([regex]::Escape($context))
        }
        $format | Should Not Match '(?i)authorization|x-api-key|identity\.sourceIp'
    }

    It 'creates exactly four scoped REST Lambda permissions' {
        foreach ($name in $functionNames) {
            $permission = Get-HclBlock $stage3 (
                'resource\s+"aws_lambda_permission"\s+"' +
                $name + '_rest"'
            )
            $permission | Should Match `
                'count\s*=\s*var\.enable_stage3\s*\?\s*1\s*:\s*0'
            (Get-HclAssignmentValue $permission 'action') |
                Should Be '"lambda:InvokeFunction"'
            (Normalize-HclExpression `
                (Get-HclAssignmentValue $permission 'function_name')) |
                Should Be (
                    'lookup(local.stage3_function_names,"' +
                    $name + '",null)'
                )
            (Get-HclAssignmentValue $permission 'principal') |
                Should Be '"apigateway.amazonaws.com"'
            (Get-HclAssignmentValue $permission 'source_arn') |
                Should Be `
                    '"${aws_api_gateway_rest_api.stage3[0].execution_arn}/*/*"'
            $permission | Should Match 'precondition\s*\{'
            $permission | Should Match `
                'condition\s*=\s*local\.stage3_dependencies_ready'
        }
    }
}

Describe 'Stage 3 REST outputs and scope boundaries' {
    It 'documents the complete Task 12 file map and six lifecycle steps' {
        $task12 = [regex]::Match(
            $planRaw,
            '(?s)### Task 12:.*?(?=\r?\n---\r?\n\r?\n### Task 13:)'
        ).Value
        $expectedFiles = @(
            'backend/common/auction_common/http.py',
            'backend/tests/unit/test_http.py',
            'backend/functions/session_service/handler.py',
            'backend/functions/item_service/handler.py',
            'backend/functions/query_service/handler.py',
            'backend/functions/admin_command/handler.py',
            'backend/tests/unit/test_session_service.py',
            'backend/tests/unit/test_item_service.py',
            'backend/tests/unit/test_query_service.py',
            'backend/tests/unit/test_admin_command.py',
            'infra/tests/stage3-compute.Tests.ps1',
            'infra/06-compute/stage3.tf',
            'infra/06-compute/variables.tf',
            'infra/06-compute/outputs.tf',
            'infra/tests/stage3-api.Tests.ps1',
            'infra/07-api/stage3.tf',
            'infra/07-api/variables.tf',
            'infra/07-api/outputs.tf'
        )

        $task12.Length | Should BeGreaterThan 0
        foreach ($file in $expectedFiles) {
            $task12 | Should Match ([regex]::Escape('`' + $file + '`'))
        }
        $steps = @([regex]::Matches(
            $task12,
            '(?m)^- \[([ x])\] \*\*Step [1-6]:'
        ))
        $steps.Count | Should Be 6
    }

    It 'documents only the two approved collection caches in Task 12' {
        $task12 = [regex]::Match(
            $planRaw,
            '(?s)### Task 12:.*?(?=\r?\n---\r?\n\r?\n### Task 13:)'
        ).Value
        $cacheExample = [regex]::Match(
            $task12,
            '(?s)stage3_cache_paths\s*=\s*toset\(\[(.*?)\]\)'
        ).Groups[1].Value

        $task12 | Should Match 'two safe collection GET'
        $cacheExample | Should Match '"/api/v1/auction-sessions"'
        $cacheExample | Should Match '"/api/v1/auction-items"'
        $cacheExample | Should Not Match '\{session_id\}|\{item_id\}'
        $task12 | Should Match `
            'do not cache[^\r\n]*(?:detail|/mine|/bids/my)'
    }

    It 'requires Task 16 to protect regional API Gateway logging consumers' {
        $task16 = [regex]::Match(
            $planRaw,
            '(?s)### Task 16:.*?(?=\r?\n---\r?\n\r?\n## Completion Evidence)'
        ).Value

        $task16 | Should Match 'exact\s+role ownership'
        $task16 | Should Match `
            '(?s)enumerate.*?non-Stage 3 REST API stages'
        $task16 | Should Match 'execution\s+logging enabled'
        $task16 | Should Match `
            '(?s)depend.*?regional API Gateway account\s+CloudWatch role'
        $task16 | Should Match `
            '(?s)refuse teardown.*?before clearing.*?account role'
    }

    It 'exports only conditional REST identifiers and never the key value' {
        $expected = @{
            stage3_rest_api_id = 'aws_api_gateway_rest_api.stage3[0].id'
            stage3_rest_execution_arn = `
                'aws_api_gateway_rest_api.stage3[0].execution_arn'
            stage3_rest_invoke_url = 'local.stage3_invoke_url'
            stage3_rest_api_key_id = 'aws_api_gateway_api_key.stage3[0].id'
            stage3_rest_stage_name = 'aws_api_gateway_stage.stage3[0].stage_name'
        }
        foreach ($name in $expected.Keys) {
            $output = Get-HclBlock $outputs ('output\s+"' + $name + '"')
            $value = Normalize-HclExpression (
                Get-HclAssignmentValue $output 'value'
            )
            $value | Should Be (
                'var.enable_stage3?' + $expected[$name] + ':null'
            )
            $output | Should Not Match '(?i)value_value|api_key_value|secret'
        }
        $outputs | Should Not Match `
            '(?i)output\s+"[^"]*(?:api_key_value|secret)[^"]*"'
    }

    It 'gates every new resource and data block module-wide' {
        foreach ($match in [regex]::Matches(
            $all,
            '(resource|data)\s+"([^"]+)"\s+"([^"]+)"\s*\{'
        )) {
            $address = "$($match.Groups[1].Value)." +
                "$($match.Groups[2].Value).$($match.Groups[3].Value)"
            if ($legacyAddresses -contains $address) {
                continue
            }
            $block = Get-HclBlock $all (
                $match.Groups[1].Value + '\s+"' +
                [regex]::Escape($match.Groups[2].Value) + '"\s+"' +
                [regex]::Escape($match.Groups[3].Value) + '"'
            )
            $block | Should Match (
                'count\s*=\s*var\.enable_stage3\s*\?\s*1\s*:\s*0|' +
                'for_each\s*=\s*var\.enable_stage3\s*\?'
            )
        }
    }

    It 'uses only approved addresses across every root Terraform file' {
        $actual = Get-RootAddresses $all
        $approved = @($legacyAddresses) + @($stage3Addresses)

        (($actual | Sort-Object) -join '|') |
            Should Be (($approved | Sort-Object) -join '|')
    }

    It 'preserves the exact Stage 2 resource inventory outside stage3.tf' {
        $actual = Get-RootAddresses $nonStage3

        (($actual | Sort-Object) -join '|') |
            Should Be (($legacyAddresses | Sort-Object) -join '|')
    }

    It 'rejects child modules Terraform JSON teardown blockers and forbidden stacks' {
        $all | Should Not Match '(?m)^\s*module\s+"[^"]+"\s*\{'
        $terraformJsonFiles.Count | Should Be 0
        $raw | Should Not Match '\bprevent_destroy\b'
        $all | Should Not Match (
            '(?i)(?:resource|data)\s+"aws_(?:' +
            'vpc[^"\s]*|subnet[^"\s]*|nat_gateway[^"\s]*|' +
            'route_table[^"\s]*|internet_gateway[^"\s]*|' +
            'security_group[^"\s]*|lb(?:_[^"\s]*)?|' +
            'rds[^"\s]*|db_[^"\s]*|aurora[^"\s]*|' +
            'ecs[^"\s]*|ecr[^"\s]*|kinesis[^"\s]*' +
            ')"'
        )
        $all | Should Not Match '(?i)\bvpc_config\b'
    }
}
