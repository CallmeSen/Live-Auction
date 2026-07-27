$repoRoot = Split-Path -Parent $PSScriptRoot
$moduleRoot = Join-Path $repoRoot '03-identity'
$requiredFiles = @(
    'backend.tf',
    'versions.tf',
    'providers.tf',
    'variables.tf',
    'main.tf',
    'outputs.tf'
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
    for ($index = $openBrace; $index -lt $Text.Length; $index++) {
        if ($Text[$index] -eq '{') {
            $depth++
        }
        elseif ($Text[$index] -eq '}') {
            $depth--
            if ($depth -eq 0) {
                return $Text.Substring($match.Index, $index - $match.Index + 1)
            }
        }
    }
    return ''
}

Describe 'Stage 2 Cognito identity module skeleton' {
    foreach ($file in $requiredFiles) {
        It "contains $file" {
            Test-Path -LiteralPath (Join-Path $moduleRoot $file) |
                Should Be $true
        }
    }

    It 'isolates identity state in the bootstrap backend region' {
        $backend = Read-ModuleFile 'backend.tf'

        $backend | Should Match 'key\s*=\s*"03-identity/terraform\.tfstate"'
        $backend | Should Match 'region\s*=\s*"ap-southeast-1"'
        $backend | Should Match 'encrypt\s*=\s*true'
        $backend | Should Not Match '111122223333|<account-id>|root'
    }

    It 'locks Terraform and the AWS provider versions' {
        $versions = Read-ModuleFile 'versions.tf'

        $versions | Should Match 'required_version\s*=\s*">= 1\.7, < 2\.0"'
        $versions | Should Match 'source\s*=\s*"hashicorp/aws"'
        $versions | Should Match 'version\s*=\s*"~> 6\.55\.0"'
    }

    It 'uses the application region and common default tags' {
        $provider = Read-ModuleFile 'providers.tf'
        $variables = Read-ModuleFile 'variables.tf'
        $regionVariable = Get-HclBlock $variables 'variable\s+"aws_region"'

        $provider | Should Match 'region\s*=\s*var\.aws_region'
        $provider | Should Match 'default_tags'
        foreach ($tag in @(
            'Project\s*=\s*var\.project',
            'Environment\s*=\s*var\.environment',
            'ManagedBy\s*=\s*"terraform"',
            'Owner\s*=\s*var\.owner'
        )) {
            $provider | Should Match $tag
        }
        $regionVariable | Should Match 'default\s*=\s*"ap-southeast-1"'
        foreach ($name in @('project', 'environment', 'name_prefix', 'owner')) {
            $variables | Should Match "variable\s+`"$name`""
        }

        $allTerraform = ($requiredFiles | ForEach-Object {
            Read-ModuleFile $_
        }) -join "`n"
        $allTerraform | Should Not Match '(?i)access_key\s*=|secret_key\s*=|profile\s*=\s*"root"|root credentials'
    }

    It 'keeps deletion protection opt-in for disposable demo environments' {
        $variables = Read-ModuleFile 'variables.tf'
        $protectionVariable = Get-HclBlock $variables `
            'variable\s+"enable_cognito_deletion_protection"'

        $protectionVariable | Should Match 'type\s*=\s*bool'
        $protectionVariable | Should Match 'default\s*=\s*false'
    }
}

Describe 'Stage 2 Cognito identity resources' {
    BeforeEach {
        $script:main = Read-ModuleFile 'main.tf'
        $script:userPool = Get-HclBlock $main 'resource\s+"aws_cognito_user_pool"\s+"main"'
        $script:webClient = Get-HclBlock $main 'resource\s+"aws_cognito_user_pool_client"\s+"web"'
    }

    It 'creates an email-based user pool with verified email' {
        ([regex]::Matches($main, 'resource\s+"aws_cognito_user_pool"\s+')).Count |
            Should Be 1
        $userPool | Should Match 'name\s*=\s*"\$\{var\.name_prefix\}-users"'
        $userPool | Should Match 'username_attributes\s*=\s*\["email"\]'
        $userPool | Should Match 'auto_verified_attributes\s*=\s*\["email"\]'
    }

    It 'enforces the strong password policy' {
        $userPool | Should Match 'password_policy\s*\{'
        $userPool | Should Match 'minimum_length\s*=\s*12'
        foreach ($setting in @(
            'require_lowercase',
            'require_uppercase',
            'require_numbers',
            'require_symbols'
        )) {
            $userPool | Should Match "$setting\s*=\s*true"
        }
        $userPool | Should Match 'temporary_password_validity_days\s*=\s*7'
    }

    It 'limits signup and protects verified email updates' {
        $userPool | Should Match '(?s)admin_create_user_config\s*\{.*?allow_admin_create_user_only\s*=\s*true'
        $userPool | Should Match '(?s)user_attribute_update_settings\s*\{.*?attributes_require_verification_before_update\s*=\s*\["email"\]'
        $userPool | Should Match 'deletion_protection\s*=\s*var\.enable_cognito_deletion_protection\s*\?\s*"ACTIVE"\s*:\s*"INACTIVE"'
    }

    It 'creates a public client with explicit password and refresh flows' {
        ([regex]::Matches($main, 'resource\s+"aws_cognito_user_pool_client"\s+')).Count |
            Should Be 1
        $webClient | Should Match 'user_pool_id\s*=\s*aws_cognito_user_pool\.main\.id'
        $webClient | Should Match 'generate_secret\s*=\s*false'
        $webClient | Should Match 'prevent_user_existence_errors\s*=\s*"ENABLED"'
        foreach ($flow in @(
            'ALLOW_ADMIN_USER_PASSWORD_AUTH',
            'ALLOW_USER_PASSWORD_AUTH',
            'ALLOW_USER_SRP_AUTH',
            'ALLOW_REFRESH_TOKEN_AUTH'
        )) {
            $webClient | Should Match $flow
        }
        $webClient | Should Match 'access_token_validity\s*=\s*1'
        $webClient | Should Match 'id_token_validity\s*=\s*1'
        $webClient | Should Match 'refresh_token_validity\s*=\s*30'
        $webClient | Should Match '(?s)token_validity_units\s*\{.*?access_token\s*=\s*"hours".*?id_token\s*=\s*"hours".*?refresh_token\s*=\s*"days"'
    }

    It 'creates the three role groups with deterministic precedence' {
        ([regex]::Matches($main, 'resource\s+"aws_cognito_user_group"\s+')).Count |
            Should Be 3
        foreach ($group in @(
            @{ Resource = 'admin'; Name = 'ADMIN'; Precedence = 1 },
            @{ Resource = 'seller'; Name = 'SELLER'; Precedence = 2 },
            @{ Resource = 'bidder'; Name = 'BIDDER'; Precedence = 3 }
        )) {
            $block = Get-HclBlock $main "resource\s+`"aws_cognito_user_group`"\s+`"$($group.Resource)`""
            $block | Should Match 'user_pool_id\s*=\s*aws_cognito_user_pool\.main\.id'
            $block | Should Match "name\s*=\s*`"$($group.Name)`""
            $block | Should Match "precedence\s*=\s*$($group.Precedence)"
        }
    }

    It 'does not add post-confirmation or unrelated infrastructure' {
        $main | Should Not Match 'post_confirmation|lambda_config|aws_lambda_'
        $main | Should Not Match 'aws_vpc|aws_subnet|aws_rds|aws_db_|aurora|aws_ecs|aws_apigateway'
        $main | Should Not Match '111122223333|<account-id>|access_key|secret_key|root'
    }
}

Describe 'Stage 2 Cognito identity outputs' {
    It 'exports the pool, client, issuer, and JWKS contracts' {
        $outputs = Read-ModuleFile 'outputs.tf'
        $main = Read-ModuleFile 'main.tf'

        $expectedOutputs = @{
            cognito_user_pool_id        = 'aws_cognito_user_pool\.main\.id'
            cognito_user_pool_arn       = 'aws_cognito_user_pool\.main\.arn'
            cognito_user_pool_client_id = 'aws_cognito_user_pool_client\.web\.id'
            cognito_client_id           = 'aws_cognito_user_pool_client\.web\.id'
            cognito_issuer              = 'local\.issuer'
            cognito_jwks_url            = 'local\.jwks_url'
        }
        foreach ($name in $expectedOutputs.Keys) {
            $block = Get-HclBlock $outputs "output\s+`"$name`""
            $block | Should Match "value\s*=\s*$($expectedOutputs[$name])"
        }
        $main | Should Match 'issuer\s*=\s*"https://\$\{aws_cognito_user_pool\.main\.endpoint\}"'
        $main | Should Match 'jwks_url\s*=\s*"\$\{local\.issuer\}/\.well-known/jwks\.json"'
    }
}
