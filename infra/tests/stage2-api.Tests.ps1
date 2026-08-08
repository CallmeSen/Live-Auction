$repoRoot = Split-Path -Parent $PSScriptRoot
$moduleRoot = Join-Path $repoRoot '07-api'
$requiredFiles = @(
    'backend.tf', 'versions.tf', 'providers.tf',
    'variables.tf', 'main.tf', 'outputs.tf'
)

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

function Read-ModuleFile([string]$Name) {
    $path = Join-Path $moduleRoot $Name
    if (-not (Test-Path -LiteralPath $path)) {
        return ''
    }
    return Remove-HclComments (Get-Content -Raw -LiteralPath $path)
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

$main = Read-ModuleFile 'main.tf'
$variables = Read-ModuleFile 'variables.tf'
$outputs = Read-ModuleFile 'outputs.tf'

Describe 'Stage 2 WebSocket API module skeleton' {
    foreach ($file in $requiredFiles) {
        It "contains $file" {
            Test-Path -LiteralPath (Join-Path $moduleRoot $file) |
                Should Be $true
        }
    }

    It 'isolates API state in the bootstrap backend region' {
        $backend = Read-ModuleFile 'backend.tf'

        $backend | Should Match 'key\s*=\s*"07-api/terraform\.tfstate"'
        $backend | Should Match 'region\s*=\s*"ap-southeast-1"'
        $backend | Should Not Match '111122223333|<account-id>|root'
    }

    It 'uses the application region, locked provider, and common tags' {
        $versions = Read-ModuleFile 'versions.tf'
        $provider = Read-ModuleFile 'providers.tf'
        $region = Get-HclBlock $variables 'variable\s+"aws_region"'

        $versions | Should Match 'required_version\s*=\s*">= 1\.7, < 2\.0"'
        $versions | Should Match 'version\s*=\s*"~> 6\.55\.0"'
        $provider | Should Match 'region\s*=\s*var\.aws_region'
        $provider | Should Match 'default_tags'
        $region | Should Match 'default\s*=\s*"ap-southeast-1"'
    }

    It 'reads only the compute state from the backend region' {
        $compute = Get-HclBlock $main `
            'data\s+"terraform_remote_state"\s+"compute"'

        $compute | Should Match 'key\s*=\s*"06-compute/terraform\.tfstate"'
        $compute | Should Match 'region\s*=\s*"ap-southeast-1"'
        $main | Should Not Match 'terraform_remote_state"\s+"(data|messaging|identity)"'
    }
}

Describe 'Stage 2 WebSocket API resources' {
    It 'creates exactly one WebSocket API with action routing' {
        ([regex]::Matches($main, 'resource\s+"aws_apigatewayv2_api"\s+')).Count |
            Should Be 1
        $api = Get-HclBlock $main `
            'resource\s+"aws_apigatewayv2_api"\s+"websocket"'

        $api | Should Match 'name\s*=\s*"\$\{var\.name_prefix\}-websocket"'
        $api | Should Match 'protocol_type\s*=\s*"WEBSOCKET"'
        $api | Should Match 'route_selection_expression\s*=\s*"\$request\.body\.action"'
    }

    It 'creates one query-token REQUEST authorizer without unsupported WebSocket TTL' {
        ([regex]::Matches($main, 'resource\s+"aws_apigatewayv2_authorizer"\s+')).Count |
            Should Be 1
        $authorizer = Get-HclBlock $main `
            'resource\s+"aws_apigatewayv2_authorizer"\s+"connect"'

        $authorizer | Should Match 'api_id\s*=\s*aws_apigatewayv2_api\.websocket\.id'
        $authorizer | Should Match 'authorizer_type\s*=\s*"REQUEST"'
        $authorizer | Should Match 'authorizer_uri\s*=\s*data\.terraform_remote_state\.compute\.outputs\.ws_authorizer_invoke_arn'
        $authorizer | Should Match 'identity_sources\s*=\s*\["route\.request\.querystring\.token"\]'
        $authorizer | Should Not Match 'authorizer_result_ttl_in_seconds'
        $authorizer | Should Match 'name\s*=\s*"\$\{var\.name_prefix\}-ws-authorizer"'
    }

    It 'uses one ws-handler AWS proxy integration without HTTP payload settings' {
        ([regex]::Matches($main, 'resource\s+"aws_apigatewayv2_integration"\s+')).Count |
            Should Be 1
        $integration = Get-HclBlock $main `
            'resource\s+"aws_apigatewayv2_integration"\s+"ws_handler"'

        $integration | Should Match 'api_id\s*=\s*aws_apigatewayv2_api\.websocket\.id'
        $integration | Should Match 'integration_type\s*=\s*"AWS_PROXY"'
        $integration | Should Match 'integration_method\s*=\s*"POST"'
        $integration | Should Match 'integration_uri\s*=\s*data\.terraform_remote_state\.compute\.outputs\.ws_handler_invoke_arn'
        $integration | Should Not Match 'payload_format_version'
    }

    It 'creates exactly the four approved routes' {
        ([regex]::Matches($main, 'resource\s+"aws_apigatewayv2_route"\s+')).Count |
            Should Be 4
        $expected = @{
            connect    = '$connect'
            disconnect = '$disconnect'
            join_room  = 'joinRoom'
            place_bid  = 'placeBid'
        }
        foreach ($name in $expected.Keys) {
            $route = Get-HclBlock $main `
                "resource\s+`"aws_apigatewayv2_route`"\s+`"$name`""
            $routeKey = [regex]::Escape($expected[$name])
            $route | Should Match "route_key\s*=\s*`"$routeKey`""
            $route | Should Match 'target\s*=\s*"integrations/\$\{aws_apigatewayv2_integration\.ws_handler\.id\}"'
        }
        $main | Should Not Match 'route_key\s*=\s*"\$default"'
    }

    It 'authorizes only connect and resolves later identity from DynamoDB' {
        $connect = Get-HclBlock $main `
            'resource\s+"aws_apigatewayv2_route"\s+"connect"'
        $connect | Should Match 'authorization_type\s*=\s*"CUSTOM"'
        $connect | Should Match 'authorizer_id\s*=\s*aws_apigatewayv2_authorizer\.connect\.id'

        foreach ($name in @('disconnect', 'join_room', 'place_bid')) {
            $route = Get-HclBlock $main `
                "resource\s+`"aws_apigatewayv2_route`"\s+`"$name`""
            $route | Should Match 'authorization_type\s*=\s*"NONE"'
            $route | Should Not Match 'authorizer_id'
        }
    }

    It 'creates an auto-deploy prod stage without query-string access logs' {
        $stage = Get-HclBlock $main `
            'resource\s+"aws_apigatewayv2_stage"\s+"websocket"'

        $stage | Should Match 'api_id\s*=\s*aws_apigatewayv2_api\.websocket\.id'
        $stage | Should Match 'name\s*=\s*"prod"'
        $stage | Should Match 'auto_deploy\s*=\s*true'
        $stage | Should Not Match 'access_log_settings|queryString|querystring'
    }
}

Describe 'Stage 2 API invoke boundaries and outputs' {
    It 'grants API Gateway only authorizer and handler invocation' {
        ([regex]::Matches($main, 'resource\s+"aws_lambda_permission"\s+')).Count |
            Should Be 2
        $authorizer = Get-HclBlock $main `
            'resource\s+"aws_lambda_permission"\s+"ws_authorizer"'
        $handler = Get-HclBlock $main `
            'resource\s+"aws_lambda_permission"\s+"ws_handler"'

        foreach ($permission in @($authorizer, $handler)) {
            $permission | Should Match 'action\s*=\s*"lambda:InvokeFunction"'
            $permission | Should Match 'principal\s*=\s*"apigateway\.amazonaws\.com"'
        }
        $authorizer | Should Match 'function_name\s*=\s*data\.terraform_remote_state\.compute\.outputs\.ws_authorizer_function_name'
        $authorizer | Should Match 'source_arn\s*=\s*"\$\{aws_apigatewayv2_api\.websocket\.execution_arn\}/authorizers/\$\{aws_apigatewayv2_authorizer\.connect\.id\}"'
        $handler | Should Match 'function_name\s*=\s*data\.terraform_remote_state\.compute\.outputs\.ws_handler_function_name'
        $handler | Should Match 'source_arn\s*=\s*"\$\{aws_apigatewayv2_api\.websocket\.execution_arn\}/\*"'
        $main | Should Not Match 'broadcast_function_name|broadcast_invoke_arn'
    }

    It 'exports the API, stage, client URL, and management endpoint' {
        $expected = @{
            websocket_api_id = 'aws_apigatewayv2_api\.websocket\.id'
            websocket_stage_name = 'aws_apigatewayv2_stage\.websocket\.name'
            websocket_url = 'local\.websocket_url'
            websocket_management_endpoint = 'local\.websocket_management_endpoint'
        }
        foreach ($name in $expected.Keys) {
            $block = Get-HclBlock $outputs "output\s+`"$name`""
            $block | Should Match "value\s*=\s*$($expected[$name])"
        }
        $main | Should Match 'websocket_url\s*=\s*"wss://\$\{aws_apigatewayv2_api\.websocket\.id\}\.execute-api\.\$\{var\.aws_region\}\.amazonaws\.com/\$\{aws_apigatewayv2_stage\.websocket\.name\}"'
        $main | Should Match 'websocket_management_endpoint\s*=\s*"https://\$\{aws_apigatewayv2_api\.websocket\.id\}\.execute-api\.\$\{var\.aws_region\}\.amazonaws\.com/\$\{aws_apigatewayv2_stage\.websocket\.name\}"'
    }

    It 'contains no unrelated infrastructure, secret logs, or wildcard IAM' {
        $allTerraform = ($requiredFiles | ForEach-Object {
            Read-ModuleFile $_
        }) -join "`n"

        $allTerraform | Should Not Match 'aws_cognito|aws_vpc|aws_subnet|aws_rds|aws_db_|aurora|aws_ecs'
        $allTerraform | Should Not Match '(?i)access_key\s*=|secret_key\s*=|profile\s*=\s*"root"'
        $allTerraform | Should Not Match 'action\s*=\s*"\*"|actions\s*=\s*\[\s*"\*"\s*\]'
        $allTerraform | Should Not Match 'payload_format_version'
    }
}
