$repoRoot = Split-Path -Parent $PSScriptRoot
$parentRoot = Join-Path $repoRoot '06-compute'
$moduleRoot = Join-Path $parentRoot 'stage3-control-plane'

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
    if ($closingFor.ContainsKey([string]$Text[$start])) {
        $stack = New-Object 'System.Collections.Generic.Stack[char]'
        $inString = $false
        $escaped = $false
        for ($index = $start; $index -lt $Text.Length; $index++) {
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
                        return $Text.Substring(
                            $start,
                            $index - $start + 1
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

    $stack = New-Object 'System.Collections.Generic.Stack[char]'
    $inString = $false
    $escaped = $false
    $end = $start
    for (; $end -lt $Text.Length; $end++) {
        $current = $Text[$end]
        if ($current -eq '"' -and -not $escaped) {
            $inString = -not $inString
        }
        elseif (-not $inString) {
            if ($closingFor.ContainsKey([string]$current)) {
                $stack.Push([char]$closingFor[[string]$current])
            }
            elseif ($stack.Count -gt 0 -and $current -eq $stack.Peek()) {
                [void]$stack.Pop()
            }
            elseif (
                $stack.Count -eq 0 -and
                (
                    $current -eq "`r" -or
                    $current -eq "`n" -or
                    $current -eq ',' -or
                    $current -eq ']' -or
                    $current -eq '}'
                )
            ) {
                break
            }
        }
        if ($inString -and $current -eq '\' -and -not $escaped) {
            $escaped = $true
        }
        else {
            $escaped = $false
        }
    }
    return $Text.Substring($start, $end - $start).Trim()
}

function Get-HclListItems([string]$Expression) {
    $trimmed = $Expression.Trim()
    if (
        $trimmed.Length -lt 2 -or
        $trimmed[0] -ne '[' -or
        $trimmed[$trimmed.Length - 1] -ne ']'
    ) {
        return @()
    }

    $body = $trimmed.Substring(1, $trimmed.Length - 2)
    $items = New-Object 'System.Collections.Generic.List[string]'
    $closingFor = @{
        '[' = ']'
        '{' = '}'
        '(' = ')'
    }
    $stack = New-Object 'System.Collections.Generic.Stack[char]'
    $inString = $false
    $escaped = $false
    $start = 0
    for ($index = 0; $index -lt $body.Length; $index++) {
        $current = $body[$index]
        if ($current -eq '"' -and -not $escaped) {
            $inString = -not $inString
        }
        elseif (-not $inString) {
            if ($closingFor.ContainsKey([string]$current)) {
                $stack.Push([char]$closingFor[[string]$current])
            }
            elseif ($stack.Count -gt 0 -and $current -eq $stack.Peek()) {
                [void]$stack.Pop()
            }
            elseif ($current -eq ',' -and $stack.Count -eq 0) {
                $item = $body.Substring($start, $index - $start).Trim()
                if ($item) {
                    $items.Add($item)
                }
                $start = $index + 1
            }
        }
        if ($inString -and $current -eq '\' -and -not $escaped) {
            $escaped = $true
        }
        else {
            $escaped = $false
        }
    }

    $last = $body.Substring($start).Trim()
    if ($last) {
        $items.Add($last)
    }
    return $items.ToArray()
}

function Normalize-HclExpression([string]$Expression) {
    $result = New-Object System.Text.StringBuilder
    $inString = $false
    $escaped = $false
    foreach ($current in $Expression.ToCharArray()) {
        if ($current -eq '"' -and -not $escaped) {
            $inString = -not $inString
        }
        if ($inString -or -not [char]::IsWhiteSpace($current)) {
            [void]$result.Append($current)
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

function Test-ExactHclList(
    [string]$Expression,
    [string[]]$Expected
) {
    $trimmed = $Expression.Trim()
    if (
        $trimmed.Length -lt 2 -or
        $trimmed[0] -ne '[' -or
        $trimmed[$trimmed.Length - 1] -ne ']'
    ) {
        return $false
    }

    $actual = @(Get-HclListItems $trimmed)
    if ($actual.Count -ne $Expected.Count) {
        return $false
    }
    for ($index = 0; $index -lt $actual.Count; $index++) {
        if ($actual[$index] -cne $Expected[$index]) {
            return $false
        }
    }
    return $true
}

function Test-IamRolePolicyBypass([string]$Text) {
    return $Text -match (
        '(?m)^\s*(?:inline_policy\s*\{|' +
        'dynamic\s+"inline_policy"\s*\{|managed_policy_arns\s*=)'
    )
}

function Test-IamPolicyDocumentMergeBypass([string]$Text) {
    return $Text -match `
        '(?m)^\s*(?:source_policy_documents|override_policy_documents)\s*='
}

function Get-ProviderOverrideAddresses([string]$Text) {
    $addresses = New-Object System.Collections.Generic.List[string]
    foreach ($match in [regex]::Matches(
        $Text,
        '(resource|data)\s+"([^"]+)"\s+"([^"]+)"\s*\{'
    )) {
        $kind = $match.Groups[1].Value
        $type = $match.Groups[2].Value
        $name = $match.Groups[3].Value
        if (
            $kind -ne 'resource' -and
            $type -notlike 'aws_*' -and
            $type -ne 'terraform_remote_state'
        ) {
            continue
        }

        $block = Get-HclBlock $Text (
            $kind + '\s+"' + [regex]::Escape($type) + '"\s+"' +
            [regex]::Escape($name) + '"'
        )
        if ((Get-HclAssignmentValue $block 'provider').Length -gt 0) {
            $addresses.Add("$kind.$type.$name")
        }
    }
    return $addresses.ToArray()
}

function Get-PolicyStatement([string]$Policy, [string]$Sid) {
    $matches = @(Get-HclBlocks $Policy 'statement' | Where-Object {
        (Get-HclAssignmentValue $_ 'sid') -ceq ('"' + $Sid + '"')
    })
    if ($matches.Count -ne 1) {
        return ''
    }
    return $matches[0]
}

function Assert-ExactStatement(
    [string]$Policy,
    [string]$Sid,
    [string[]]$Actions,
    [string[]]$Resources
) {
    $statement = Get-PolicyStatement $Policy $Sid
    $statement.Length | Should BeGreaterThan 0
    (Get-HclAssignmentValue $statement 'effect') | Should Be '"Allow"'
    (Test-ExactHclList `
        (Get-HclAssignmentValue $statement 'actions') `
        $Actions) | Should Be $true
    (Test-ExactHclList `
        (Get-HclAssignmentValue $statement 'resources') `
        $Resources) | Should Be $true

    foreach ($name in @('sid', 'effect', 'actions', 'resources')) {
        ([regex]::Matches(
            $statement,
            "(?m)^\s*$name\s*="
        )).Count | Should Be 1
    }
    $statement | Should Not Match `
        '(?m)^\s*(?:action|resource|not_actions|not_resources)\s*='
    $statement | Should Not Match '(?m)^\s*principals\s*\{'
}

function Assert-ExactEnvironment(
    [string]$Function,
    [hashtable]$Expected
) {
    $environment = Get-HclBlock $Function 'environment'
    $map = Get-HclAssignmentValue $environment 'variables'
    $actualKeys = @([regex]::Matches(
        $map,
        '(?m)^\s*([A-Z][A-Z0-9_]*)\s*='
    ) | ForEach-Object {
        $_.Groups[1].Value
    })

    (($actualKeys | Sort-Object) -join '|') |
        Should Be (($Expected.Keys | Sort-Object) -join '|')
    foreach ($name in $Expected.Keys) {
        (Get-HclAssignmentValue $map $name) | Should Be $Expected[$name]
    }
}

$terraformFiles = @(Get-ChildItem -LiteralPath $moduleRoot -Filter '*.tf' -File `
    -ErrorAction SilentlyContinue |
    Sort-Object FullName)
$terraformJsonFiles = @(Get-ChildItem -LiteralPath $moduleRoot `
    -Filter '*.tf.json' -File -ErrorAction SilentlyContinue)
$terraformSources = @($terraformFiles | ForEach-Object {
    [pscustomobject]@{
        Name = $_.Name
        Text = Get-Content -Raw -LiteralPath $_.FullName
    }
})
$raw = ($terraformSources.Text) -join "`n"
$all = Remove-HclComments $raw
$mainPath = Join-Path $moduleRoot 'main.tf'
$main = if (Test-Path -LiteralPath $mainPath) {
    Remove-HclComments (Get-Content -Raw -LiteralPath $mainPath)
}
else {
    ''
}
$stage3 = $main
$variablesPath = Join-Path $moduleRoot 'variables.tf'
$variables = if (Test-Path -LiteralPath $variablesPath) {
    Remove-HclComments (Get-Content -Raw -LiteralPath $variablesPath)
}
else {
    ''
}
$outputsPath = Join-Path $moduleRoot 'outputs.tf'
$outputs = if (Test-Path -LiteralPath $outputsPath) {
    Remove-HclComments (Get-Content -Raw -LiteralPath $outputsPath)
}
else {
    ''
}
$backendPath = Join-Path $moduleRoot 'backend.tf'
$backend = if (Test-Path -LiteralPath $backendPath) {
    Remove-HclComments (Get-Content -Raw -LiteralPath $backendPath)
}
else {
    ''
}
$versionsPath = Join-Path $moduleRoot 'versions.tf'
$versions = if (Test-Path -LiteralPath $versionsPath) {
    Remove-HclComments (Get-Content -Raw -LiteralPath $versionsPath)
}
else {
    ''
}
$providersPath = Join-Path $moduleRoot 'providers.tf'
$providers = if (Test-Path -LiteralPath $providersPath) {
    Remove-HclComments (Get-Content -Raw -LiteralPath $providersPath)
}
else {
    ''
}
$lockPath = Join-Path $moduleRoot '.terraform.lock.hcl'
$lock = if (Test-Path -LiteralPath $lockPath) {
    Remove-HclComments (Get-Content -Raw -LiteralPath $lockPath)
}
else {
    ''
}
$parentTerraformFiles = @(Get-ChildItem -LiteralPath $parentRoot `
    -Filter '*.tf' -File | Sort-Object FullName)
$parentRaw = ($parentTerraformFiles | ForEach-Object {
    Get-Content -Raw -LiteralPath $_.FullName
}) -join "`n"
$parentAll = Remove-HclComments $parentRaw
$parentMain = Remove-HclComments (Get-Content -Raw -LiteralPath `
    (Join-Path $parentRoot 'main.tf'))
$parentVariables = Remove-HclComments (Get-Content -Raw -LiteralPath `
    (Join-Path $parentRoot 'variables.tf'))
$parentOutputs = Remove-HclComments (Get-Content -Raw -LiteralPath `
    (Join-Path $parentRoot 'outputs.tf'))
$functionNames = @(
    'session_service',
    'item_service',
    'query_service',
    'admin_command'
)
$legacyAddresses = @(
    'data.terraform_remote_state.data',
    'data.terraform_remote_state.messaging',
    'data.aws_partition.current',
    'data.aws_caller_identity.current',
    'data.aws_iam_policy_document.lambda_assume_role'
)
$parentLegacyAddresses = @(
    'data.terraform_remote_state.data',
    'data.terraform_remote_state.messaging',
    'data.terraform_remote_state.identity',
    'data.aws_partition.current',
    'data.aws_caller_identity.current',
    'data.aws_iam_policy_document.lambda_assume_role',
    'resource.aws_iam_role.bid_processor',
    'data.aws_iam_policy_document.bid_processor',
    'resource.aws_iam_role_policy.bid_processor',
    'resource.aws_cloudwatch_log_group.bid_processor',
    'resource.aws_lambda_layer_version.common',
    'resource.aws_lambda_function.bid_processor',
    'resource.aws_lambda_event_source_mapping.bid',
    'resource.aws_iam_role.ws_authorizer',
    'data.aws_iam_policy_document.ws_authorizer',
    'resource.aws_iam_role_policy.ws_authorizer',
    'resource.aws_cloudwatch_log_group.ws_authorizer',
    'resource.aws_lambda_function.ws_authorizer',
    'resource.aws_iam_role.ws_handler',
    'data.aws_iam_policy_document.ws_handler',
    'resource.aws_iam_role_policy.ws_handler',
    'resource.aws_cloudwatch_log_group.ws_handler',
    'resource.aws_lambda_function.ws_handler',
    'resource.aws_iam_role.broadcast',
    'data.aws_iam_policy_document.broadcast',
    'resource.aws_iam_role_policy.broadcast',
    'resource.aws_cloudwatch_log_group.broadcast',
    'resource.aws_lambda_function.broadcast'
)
$stage3Addresses = @(
    'data.terraform_remote_state.identity',
    'resource.aws_lambda_layer_version.stage3_common',
    'resource.aws_lambda_permission.admin_scheduler',
    'resource.aws_scheduler_schedule.lifecycle_watchdog'
)
foreach ($name in $functionNames) {
    $stage3Addresses += "data.aws_iam_policy_document.$name"
    foreach ($type in @(
        'aws_iam_role',
        'aws_iam_role_policy',
        'aws_cloudwatch_log_group',
        'aws_lambda_function'
    )) {
        $stage3Addresses += "resource.$type.$name"
    }
}

Describe 'Stage 3 compute Terraform parsing and inputs' {
    It 'extracts complete indexed scalar references' {
        $fixture = 'value = aws_lambda_function.admin_command[0].arn'

        (Get-HclAssignmentValue $fixture 'value') |
            Should Be 'aws_lambda_function.admin_command[0].arn'
    }

    It 'extracts complete nested function expressions' {
        $fixture = 'input = jsonencode({ command = "WATCHDOG_SWEEP" })'

        (Normalize-HclExpression `
            (Get-HclAssignmentValue $fixture 'input')) |
            Should Be 'jsonencode({command="WATCHDOG_SWEEP"})'
    }

    It 'uses one complete isolated Terraform root' {
        (Test-Path -LiteralPath $moduleRoot -PathType Container) |
            Should Be $true
        (($terraformFiles.Name | Sort-Object) -join '|') | Should Be (
            'backend.tf|main.tf|outputs.tf|providers.tf|variables.tf|' +
            'versions.tf'
        )
        foreach ($file in $terraformFiles) {
            (Get-Content -Raw -LiteralPath $file.FullName).Length |
                Should BeGreaterThan 0
        }
    }

    It 'uses the exact unique backend provider and default tags' {
        $backend | Should Match 'backend\s+"s3"'
        $backend | Should Match `
            'bucket\s*=\s*"la-tfstate-233376973052"'
        $backend | Should Match (
            'key\s*=\s*"06-compute/stage3-control-plane/' +
            'terraform\.tfstate"'
        )
        $backend | Should Match 'region\s*=\s*"ap-southeast-1"'
        $backend | Should Match 'dynamodb_table\s*=\s*"la-tflock"'
        $backend | Should Match 'encrypt\s*=\s*true'
        $backend | Should Not Match `
            'key\s*=\s*"06-compute/terraform\.tfstate"'

        $versions | Should Match `
            'required_version\s*=\s*">= 1\.7, < 2\.0"'
        $versions | Should Match 'source\s*=\s*"hashicorp/aws"'
        $versions | Should Match 'version\s*=\s*"~> 6\.55\.0"'
        foreach ($tag in @('Project', 'Environment', 'ManagedBy', 'Owner')) {
            $providers | Should Match ('(?m)^\s*' + $tag + '\s*=')
        }
        $providers | Should Match 'ManagedBy\s*=\s*"terraform"'
        $providers | Should Match 'region\s*=\s*var\.aws_region'
        $providers | Should Match 'default_tags\s*\{'
    }

    It 'pins profile la-admin on the backend and both remote state clients' {
        $s3Backend = Get-HclBlock $backend 'backend\s+"s3"'
        (Get-HclAssignmentValue $s3Backend 'profile') | Should Be '"la-admin"'

        foreach ($name in @('data', 'messaging', 'identity')) {
            $state = Get-HclBlock $main (
                'data\s+"terraform_remote_state"\s+"' + $name + '"'
            )
            $config = Get-HclBlock $state 'config\s*='

            $config.Length | Should BeGreaterThan 0
            (Get-HclAssignmentValue $config 'profile') |
                Should Be '"la-admin"'
        }
    }

    It 'defines exactly one unaliased AWS provider across the root' {
        $awsProviders = @(Get-HclBlocks $all 'provider\s+"aws"')

        $awsProviders.Count | Should Be 1
        (Get-HclAssignmentValue $awsProviders[0] 'alias') | Should Be ''
        $awsProviders[0] | Should Not Match '(?m)^\s*alias\s*='
    }

    It 'rejects provider overrides only in actual managed and data blocks' {
        @(Get-ProviderOverrideAddresses $all).Count | Should Be 0

        $mutated = @'
resource "aws_lambda_function" "mutated" {
  provider = aws.bypass
}
data "aws_caller_identity" "mutated" {
  provider = aws.bypass
}
data "terraform_remote_state" "mutated" {
  provider = aws.bypass
}
'@
        ((Get-ProviderOverrideAddresses $mutated | Sort-Object) -join '|') |
            Should Be (
                'data.aws_caller_identity.mutated|' +
                'data.terraform_remote_state.mutated|' +
                'resource.aws_lambda_function.mutated'
            )

        $nonBlockText = @'
terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
    }
  }
}
locals {
  ordinary_text = "provider = aws.bypass"
}
'@
        @(Get-ProviderOverrideAddresses $nonBlockText).Count | Should Be 0
    }

    It 'pins the exact deployment profile account caller and region for every plan' {
        $provider = Get-HclBlock $providers 'provider\s+"aws"'
        $region = Get-HclBlock $variables 'variable\s+"aws_region"'
        $caller = Get-HclBlock $main `
            'data\s+"aws_caller_identity"\s+"current"'
        $lifecycle = Get-HclBlock $caller 'lifecycle'
        $postcondition = Get-HclBlock $lifecycle 'postcondition'
        $condition = Normalize-HclExpression (
            Get-HclAssignmentValue $postcondition 'condition'
        )

        (Get-HclAssignmentValue $provider 'profile') | Should Be '"la-admin"'
        (Test-ExactHclList `
            (Get-HclAssignmentValue $provider 'allowed_account_ids') `
            @('"233376973052"')) | Should Be $true
        (Get-HclAssignmentValue $provider 'region') |
            Should Be 'var.aws_region'

        (Get-HclAssignmentValue $region 'default') |
            Should Be '"ap-southeast-1"'
        $regionValidation = Get-HclBlock $region 'validation'
        (Normalize-HclExpression (
            Get-HclAssignmentValue $regionValidation 'condition'
        )) | Should Be 'var.aws_region=="ap-southeast-1"'
        (Get-HclAssignmentValue $regionValidation 'error_message') |
            Should Match '"[^"\r\n]*ap-southeast-1[^"\r\n]*"'

        $caller.Length | Should BeGreaterThan 0
        $caller | Should Not Match '\bcount\s*=|\bfor_each\s*='
        $caller | Should Not Match 'var\.enable_stage3'
        ([regex]::Matches($caller, 'lifecycle\s*\{')).Count | Should Be 1
        ([regex]::Matches($lifecycle, 'postcondition\s*\{')).Count |
            Should Be 1
        $condition | Should Be (
            'self.account_id=="233376973052"&&' +
            'self.arn=="arn:aws:iam::233376973052:user/la-admin"'
        )
        $condition | Should Not Match '\|\||\b(?:can|try|contains|startswith)\('
        (Get-HclAssignmentValue $postcondition 'error_message') |
            Should Match (
                '"[^"\r\n]*233376973052[^"\r\n]*' +
                'arn:aws:iam::233376973052:user/la-admin[^"\r\n]*"'
            )
    }

    It 'locks the exact AWS provider version and constraint' {
        Test-Path -LiteralPath $lockPath -PathType Leaf | Should Be $true
        $providerBlocks = @(Get-HclBlocks $lock `
            'provider\s+"registry\.terraform\.io/hashicorp/aws"')

        $providerBlocks.Count | Should Be 1
        (Get-HclAssignmentValue $providerBlocks[0] 'version') |
            Should Be '"6.55.0"'
        (Get-HclAssignmentValue $providerBlocks[0] 'constraints') |
            Should Be '"~> 6.55.0"'
    }

    It 'reads only the exact Stage 3 data and messaging states' {
        $dataState = Get-HclBlock $main `
            'data\s+"terraform_remote_state"\s+"data"'
        $messagingState = Get-HclBlock $main `
            'data\s+"terraform_remote_state"\s+"messaging"'

        foreach ($state in @($dataState, $messagingState)) {
            $state | Should Match 'backend\s*=\s*"s3"'
            $state | Should Match 'bucket\s*=\s*"la-tfstate-233376973052"'
            $state | Should Match 'region\s*=\s*"ap-southeast-1"'
            $state | Should Match 'dynamodb_table\s*=\s*"la-tflock"'
            $state | Should Match 'encrypt\s*=\s*true'
        }
        $dataState | Should Match 'key\s*=\s*"04-data/terraform\.tfstate"'
        $messagingState | Should Match `
            'key\s*=\s*"05-messaging/terraform\.tfstate"'
        $identityState = Get-HclBlock $main `
            'data\s+"terraform_remote_state"\s+"identity"'
        $identityState | Should Match `
            'count\s*=\s*var\.enable_stage3\s*\?\s*1\s*:\s*0'
        $identityState | Should Match `
            'key\s*=\s*"03-identity/terraform\.tfstate"'
    }

    It 'defaults the Stage 3 gate to false' {
        $gate = Get-HclBlock $variables 'variable\s+"enable_stage3"'

        $gate | Should Match 'type\s*=\s*bool'
        $gate | Should Match 'default\s*=\s*false'
    }

    It 'limits the name prefix for the Scheduler watchdog name' {
        $input = Get-HclBlock $variables 'variable\s+"name_prefix"'

        $input | Should Match `
            'description\s*=\s*"[^"\r\n]*1[^"\r\n]*45[^"\r\n]*ASCII[^"\r\n]*"'
        $input | Should Match 'type\s*=\s*string'
        $input | Should Match 'default\s*=\s*"la"'
        $input | Should Match 'length\(var\.name_prefix\)\s*>=\s*1'
        $input | Should Match 'length\(var\.name_prefix\)\s*<=\s*45'
        $input | Should Match (
            'can\(regex\("\^\[A-Za-z0-9\]' +
            '\[A-Za-z0-9_-\]\{0,44\}\$",\s*var\.name_prefix\)\)'
        )
        $input | Should Match `
            'error_message\s*=\s*"[^"\r\n]*1[^"\r\n]*45[^"\r\n]*(?:letter|alphanumeric)[^"\r\n]*(?:hyphen|underscore)[^"\r\n]*"'
    }

    It 'accepts 45 prefix characters and rejects 46 without weakening syntax' {
        $input = Get-HclBlock $variables 'variable\s+"name_prefix"'

        $pattern = [regex]::Match(
            $input,
            'can\(regex\("([^"\r\n]+)",\s*var\.name_prefix\)\)'
        ).Groups[1].Value
        $pattern = '(?-i)' + $pattern.Replace('\\', '\')
        foreach ($valid in @('a', '9', 'Auction_9-prod', ('a' * 45))) {
            $valid | Should Match $pattern
        }
        foreach ($invalid in @(
            '', '_auction', '-auction', 'auction.name', 'auction name',
            ('auction' + [char]0x00E9), ('a' * 46)
        )) {
            $invalid | Should Not Match $pattern
        }
    }

    It 'caps max media bytes at a positive integer five MiB' {
        $input = Get-HclBlock $variables 'variable\s+"max_media_bytes"'

        $input | Should Match 'type\s*=\s*number'
        $input | Should Match 'default\s*=\s*5242880'
        $input | Should Match 'var\.max_media_bytes\s*>\s*0'
        $input | Should Match 'var\.max_media_bytes\s*<=\s*5242880'
        $input | Should Match `
            'floor\(var\.max_media_bytes\)\s*==\s*var\.max_media_bytes'
        $input | Should Match 'error_message\s*=\s*"[^"\r\n]+"'
    }

    It 'accepts only a canonical browser origin with an optional valid port' {
        $input = Get-HclBlock $variables `
            'variable\s+"stage3_cors_allowed_origin"'

        $input | Should Match 'type\s*=\s*string'
        $input | Should Match `
            'default\s*=\s*"http://localhost:5173"'
        $input | Should Match `
            'length\(var\.stage3_cors_allowed_origin\)\s*<=\s*255'
        $patternMatch = [regex]::Match(
            $input,
            'can\(regex\("([^"\r\n]+)",\s*var\.stage3_cors_allowed_origin\)\)'
        )
        $patternMatch.Success | Should Be $true
        $pattern = '(?-i)' + $patternMatch.Groups[1].Value.Replace('\\', '\')
        $pattern | Should Be (
            '(?-i)^https?://[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?' +
            '(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*' +
            '(:[0-9]{1,5})?$'
        )
        $input | Should Match `
            '!strcontains\(var\.stage3_cors_allowed_origin,\s*"\*"\)'
        $input | Should Match `
            'var\.stage3_cors_allowed_origin\s*==\s*lower\(var\.stage3_cors_allowed_origin\)'
        $input | Should Match `
            'try\(tonumber\(regex\(":\(\[0-9\]\{1,5\}\)\$",\s*var\.stage3_cors_allowed_origin\)\[0\]\),\s*1\)\s*>=\s*1'
        $input | Should Match `
            'try\(tonumber\(regex\(":\(\[0-9\]\{1,5\}\)\$",\s*var\.stage3_cors_allowed_origin\)\[0\]\),\s*1\)\s*<=\s*65535'
        $input | Should Match 'error_message\s*=\s*"[^"\r\n]+"'

        $accepts = {
            param([string]$Origin)
            if ($Origin -notmatch $pattern) {
                return $false
            }
            $port = [regex]::Match($Origin, ':([0-9]+)$')
            return -not $port.Success -or (
                [int]$port.Groups[1].Value -ge 1 -and
                [int]$port.Groups[1].Value -le 65535
            )
        }
        foreach ($valid in @(
            'http://localhost',
            'http://localhost:5173',
            'https://auction.example.com',
            'https://auction-1.dev.example:1',
            'https://a.co:65535',
            'https://auction.example.com:1',
            'https://auction.example.com:65535'
        )) {
            (& $accepts $valid) | Should Be $true
        }
        foreach ($invalid in @(
            '*',
            'HTTP://localhost',
            'https://Auction.example.com',
            'https://auction..example.com',
            'https://-auction.example.com',
            'https://auction-.example.com',
            'https://user@auction.example.com',
            'https://auction.example.com/path',
            'https://auction.example.com?query=1',
            'https://auction.example.com#fragment',
            'https://auction.example.com:0',
            'https://auction.example.com:65536',
            'https://auction.example.com:99999'
        )) {
            (& $accepts $invalid) | Should Be $false
        }
    }

    It 'includes the deployed Admin CloudFront origin in the default CORS allowlist' {
        $input = Get-HclBlock $variables `
            'variable\s+"stage3_cors_allowed_admin_origin"'

        $input | Should Match 'type\s*=\s*string'
        $input | Should Match `
            'default\s*=\s*"https://d109et9edc4f35\.cloudfront\.net"'
        $input | Should Match `
            'var\.stage3_cors_allowed_admin_origin\s*==\s*""\s*\|\|'
        $input | Should Match `
            '!strcontains\(var\.stage3_cors_allowed_admin_origin,\s*"\*"\)'
    }
}

Describe 'Stage 3 compute names and artifacts' {
    It 'defines the exact function name map' {
        $locals = Get-HclBlock $stage3 'locals'
        $map = Get-HclAssignmentValue $locals 'stage3_functions'

        (Normalize-HclExpression $map) | Should Be (
            '{session_service="${var.name_prefix}-session-service"' +
            'item_service="${var.name_prefix}-item-service"' +
            'query_service="${var.name_prefix}-query-service"' +
            'admin_command="${var.name_prefix}-admin-command"}'
        )
    }

    It 'uses deterministic build ZIP paths for all four functions' {
        $locals = Get-HclBlock $stage3 'locals'
        $archives = Get-HclAssignmentValue $locals 'stage3_archives'

        foreach ($name in $functionNames) {
            (Get-HclAssignmentValue $archives $name) | Should Be `
                ('"${path.module}/../../../backend/build/' + $name + '.zip"')
            Test-Path -LiteralPath (
                Join-Path $repoRoot ('..\backend\build\' + $name + '.zip')
            ) | Should Be $true
        }
        Test-Path -LiteralPath (
            Join-Path $repoRoot '..\backend\build\layer.zip'
        ) | Should Be $true
    }

    It 'derives only the cycle-breaking ARNs locally' {
        $locals = Get-HclBlock $stage3 'locals'

        (Get-HclAssignmentValue $locals 'stage3_admin_function_arn') |
            Should Be (
                '"arn:${data.aws_partition.current.partition}:lambda:' +
                '${var.aws_region}:${data.aws_caller_identity.current.account_id}:' +
                'function:${local.stage3_functions.admin_command}"'
            )
        (Normalize-HclExpression `
            (Get-HclAssignmentValue $locals 'stage3_schedule_resource_arn')) |
            Should Be (
                '(var.enable_stage3?"arn:${data.aws_partition.current.partition}:scheduler:' +
                '${var.aws_region}:${data.aws_caller_identity.current.account_id}:' +
                'schedule/${data.terraform_remote_state.messaging.outputs.' +
                'scheduler_group_name}/*":null)'
            )
        ([regex]::Matches(
            $stage3,
            'data\s+"aws_caller_identity"\s+"current"'
        )).Count | Should Be 1
        ([regex]::Matches(
            $stage3,
            'data\s+"aws_partition"\s+"current"'
        )).Count | Should Be 1
    }
}

Describe 'Stage 3 explicit Lambda resource stacks' {
    It 'creates one gated dedicated Stage 3 common layer' {
        $layer = Get-HclBlock $stage3 `
            'resource\s+"aws_lambda_layer_version"\s+"stage3_common"'

        $layer | Should Match `
            'count\s*=\s*var\.enable_stage3\s*\?\s*1\s*:\s*0'
        (Get-HclAssignmentValue $layer 'layer_name') |
            Should Be '"${var.name_prefix}-stage3-common"'
        (Get-HclAssignmentValue $layer 'filename') | Should Be `
            '"${path.module}/../../../backend/build/layer.zip"'
        (Get-HclAssignmentValue $layer 'source_code_hash') | Should Be `
            'filebase64sha256("${path.module}/../../../backend/build/layer.zip")'
        (Test-ExactHclList `
            (Get-HclAssignmentValue $layer 'compatible_runtimes') `
            @('"python3.13"')) | Should Be $true
        (Test-ExactHclList `
            (Get-HclAssignmentValue $layer 'compatible_architectures') `
            @('"x86_64"')) | Should Be $true
    }

    It 'creates one separately gated role policy log group and function per handler' {
        foreach ($name in $functionNames) {
            $policyDocument = Get-HclBlock $stage3 (
                'data\s+"aws_iam_policy_document"\s+"' + $name + '"'
            )
            foreach ($type in @(
                'aws_iam_role',
                'aws_iam_role_policy',
                'aws_cloudwatch_log_group',
                'aws_lambda_function'
            )) {
                $block = Get-HclBlock $stage3 (
                    'resource\s+"' + $type + '"\s+"' + $name + '"'
                )
                $block.Length | Should BeGreaterThan 0
                $block | Should Match `
                    'count\s*=\s*var\.enable_stage3\s*\?\s*1\s*:\s*0'
                $block | Should Not Match '\bfor_each\s*='
            }
            $policyDocument.Length | Should BeGreaterThan 0
            $policyDocument | Should Match `
                'count\s*=\s*var\.enable_stage3\s*\?\s*1\s*:\s*0'
            $policyDocument | Should Not Match '\bfor_each\s*='
        }
        $stage3 | Should Not Match '\bfor_each\s*='
    }

    It 'wires each role and inline policy only to its own policy document' {
        foreach ($name in $functionNames) {
            $role = Get-HclBlock $stage3 (
                'resource\s+"aws_iam_role"\s+"' + $name + '"'
            )
            $policy = Get-HclBlock $stage3 (
                'resource\s+"aws_iam_role_policy"\s+"' + $name + '"'
            )

            $role | Should Match (
                'name\s*=\s*"\$\{substr\(local\.stage3_functions\.' +
                $name + ',\s*0,\s*59\)\}-role"'
            )
            $role | Should Match `
                'assume_role_policy\s*=\s*data\.aws_iam_policy_document\.lambda_assume_role\.json'
            $policy | Should Match (
                'role\s*=\s*aws_iam_role\.' + $name + '\[0\]\.id'
            )
            $policy | Should Match (
                'policy\s*=\s*data\.aws_iam_policy_document\.' +
                $name + '\[0\]\.json'
            )
        }
    }

    It 'configures finite logs and the exact Python Lambda runtime contract' {
        foreach ($name in $functionNames) {
            $log = Get-HclBlock $stage3 (
                'resource\s+"aws_cloudwatch_log_group"\s+"' + $name + '"'
            )
            $function = Get-HclBlock $stage3 (
                'resource\s+"aws_lambda_function"\s+"' + $name + '"'
            )

            $log | Should Match (
                'name\s*=\s*"/aws/lambda/\$\{local\.stage3_functions\.' +
                $name + '\}"'
            )
            $log | Should Match `
                'retention_in_days\s*=\s*var\.log_retention_days'
            $function | Should Match (
                'function_name\s*=\s*local\.stage3_functions\.' + $name
            )
            $function | Should Match (
                'role\s*=\s*aws_iam_role\.' + $name + '\[0\]\.arn'
            )
            $function | Should Match 'runtime\s*=\s*"python3\.13"'
            $function | Should Match 'architectures\s*=\s*\["x86_64"\]'
            $function | Should Match 'handler\s*=\s*"handler\.handler"'
            $function | Should Match (
                'filename\s*=\s*local\.stage3_archives\.' + $name
            )
            $function | Should Match (
                'source_code_hash\s*=\s*filebase64sha256\(' +
                'local\.stage3_archives\.' + $name + '\)'
            )
            $function | Should Match `
                'layers\s*=\s*\[aws_lambda_layer_version\.stage3_common\[0\]\.arn\]'
            $function | Should Match 'memory_size\s*=\s*512'
            $expectedTimeout = if ($name -eq 'admin_command') { 60 } else { 30 }
            $function | Should Match "timeout\s*=\s*$expectedTimeout"
            $function | Should Not Match '\bvpc_config\b'

            $dependsOn = Get-HclAssignmentValue $function 'depends_on'
            (Test-ExactHclList $dependsOn @(
                ('aws_cloudwatch_log_group.' + $name + '[0]'),
                ('aws_iam_role_policy.' + $name + '[0]')
            )) | Should Be $true
        }
        $stage3 | Should Not Match 'aws_lambda_layer_version\.common'
    }

    It 'provides only handler-relevant environment variables and required Config names' {
        $base = @{
            TBL_AUCTION_CATALOG = 'data.terraform_remote_state.data.outputs.auction_catalog_table_name'
            TBL_ITEM_STATE = 'data.terraform_remote_state.data.outputs.item_state_table_name'
            TBL_BID_EVENTS = 'data.terraform_remote_state.data.outputs.bid_events_table_name'
        }
        $expected = @{
            session_service = $base.Clone()
            item_service = $base.Clone()
            query_service = $base.Clone()
            admin_command = $base.Clone()
        }
        $expected.item_service.TBL_CATEGORY_CATALOG = `
            'data.terraform_remote_state.data.outputs.category_catalog_table_name'
        $expected.query_service.TBL_CATEGORY_CATALOG = `
            'data.terraform_remote_state.data.outputs.category_catalog_table_name'
        $expected.admin_command.TBL_CATEGORY_CATALOG = `
            'data.terraform_remote_state.data.outputs.category_catalog_table_name'
        $expected.admin_command.TBL_ADMIN_AUDIT_EVENTS = `
            'data.terraform_remote_state.data.outputs.admin_audit_events_table_name'
        $expected.session_service.POWERTOOLS_SERVICE_NAME = '"session-service"'
        $expected.item_service.POWERTOOLS_SERVICE_NAME = '"item-service"'
        $expected.item_service.MEDIA_BUCKET = `
            'data.terraform_remote_state.data.outputs.media_bucket_name'
        $expected.item_service.MAX_MEDIA_BYTES = 'tostring(var.max_media_bytes)'
        $expected.query_service.POWERTOOLS_SERVICE_NAME = '"query-service"'
        $expected.admin_command.POWERTOOLS_SERVICE_NAME = '"admin-command"'
        $expected.admin_command.POWERTOOLS_METRICS_NAMESPACE = 'local.metrics_ns'
        $expected.admin_command.OWNER_REGION = 'var.aws_region'
        $expected.admin_command.SCHEDULER_GROUP = `
            'data.terraform_remote_state.messaging.outputs.scheduler_group_name'
        $expected.admin_command.SCHEDULER_ROLE_ARN = `
            'data.terraform_remote_state.messaging.outputs.scheduler_role_arn'
        $expected.admin_command.SCHEDULER_DLQ_ARN = `
            'data.terraform_remote_state.messaging.outputs.scheduler_dlq_arn'
        $expected.admin_command.ADMIN_COMMAND_ARN = `
            'local.stage3_admin_function_arn'
        $expected.admin_command.COGNITO_USER_POOL_ID = `
            'data.terraform_remote_state.identity[0].outputs.cognito_user_pool_id'
        $expected.admin_command.BOOTSTRAP_ADMIN_SUB = `
            'var.bootstrap_admin_sub'

        foreach ($name in $functionNames) {
            $expected[$name].CORS_ALLOWED_ORIGIN = `
                'var.stage3_cors_allowed_origin'
            $expected[$name].CORS_ALLOWED_ORIGINS = `
                'jsonencode(local.stage3_cors_allowed_origins)'
        }

        foreach ($name in $functionNames) {
            $function = Get-HclBlock $stage3 (
                'resource\s+"aws_lambda_function"\s+"' + $name + '"'
            )
            Assert-ExactEnvironment $function $expected[$name]
        }
    }
}

Describe 'Stage 3 exact least privilege IAM' {
    BeforeEach {
        $script:sessionPolicy = Get-HclBlock $all `
            'data\s+"aws_iam_policy_document"\s+"session_service"'
        $script:itemPolicy = Get-HclBlock $all `
            'data\s+"aws_iam_policy_document"\s+"item_service"'
        $script:queryPolicy = Get-HclBlock $all `
            'data\s+"aws_iam_policy_document"\s+"query_service"'
        $script:adminPolicy = Get-HclBlock $all `
            'data\s+"aws_iam_policy_document"\s+"admin_command"'
        $script:catalog = `
            'data.terraform_remote_state.data.outputs.auction_catalog_table_arn'
        $script:catalogGsi1 = `
            '"${data.terraform_remote_state.data.outputs.auction_catalog_table_arn}/index/gsi1"'
        $script:catalogGsi2 = `
            '"${data.terraform_remote_state.data.outputs.auction_catalog_table_arn}/index/gsi2"'
        $script:itemState = `
            'data.terraform_remote_state.data.outputs.item_state_table_arn'
        $script:bidEvents = `
            'data.terraform_remote_state.data.outputs.bid_events_table_arn'
        $script:bidderEventsIndex = (
            '"${data.terraform_remote_state.data.outputs.bid_events_table_arn}' +
            '/index/${data.terraform_remote_state.data.outputs.' +
            'bidder_events_index_name}"'
        )
    }

    It 'grants every function only scoped writes to its own log group' {
        foreach ($name in $functionNames) {
            $policy = Get-HclBlock $all (
                'data\s+"aws_iam_policy_document"\s+"' + $name + '"'
            )
            Assert-ExactStatement $policy 'WriteFunctionLogs' @(
                '"logs:CreateLogStream"',
                '"logs:PutLogEvents"'
            ) @(
                ('"${aws_cloudwatch_log_group.' + $name + '[0].arn}:*"')
            )
        }
    }

    It 'grants session service only catalog item mutations' {
        (Get-HclBlocks $sessionPolicy 'statement').Count | Should Be 2
        Assert-ExactStatement $sessionPolicy 'ManageCatalog' @(
            '"dynamodb:GetItem"',
            '"dynamodb:PutItem"',
            '"dynamodb:UpdateItem"'
        ) @($catalog)
    }

    It 'grants item service exact catalog and item media access' {
        (Get-HclBlocks $itemPolicy 'statement').Count | Should Be 4
        Assert-ExactStatement $itemPolicy 'ManageCatalogItems' @(
            '"dynamodb:GetItem"',
            '"dynamodb:ConditionCheckItem"',
            '"dynamodb:PutItem"',
            '"dynamodb:UpdateItem"'
        ) @($catalog)
        Assert-ExactStatement $itemPolicy 'ManageItemMedia' @(
            '"s3:PutObject"'
        ) @(
            '"${data.terraform_remote_state.data.outputs.media_bucket_arn}/items/*"'
        )
        Assert-ExactStatement $itemPolicy 'ReadCategories' @(
            '"dynamodb:GetItem"'
        ) @(
            'data.terraform_remote_state.data.outputs.category_catalog_table_arn'
        )
    }

    It 'scopes query service reads to used tables and exact indexes' {
        (Get-HclBlocks $queryPolicy 'statement').Count | Should Be 6
        Assert-ExactStatement $queryPolicy 'ReadControlPlaneItems' @(
            '"dynamodb:GetItem"'
        ) @($catalog, $itemState)
        Assert-ExactStatement $queryPolicy 'QueryCatalogRecords' @(
            '"dynamodb:Query"'
        ) @($catalog, $catalogGsi1, $catalogGsi2)
        Assert-ExactStatement $queryPolicy 'QueryBidderEvents' @(
            '"dynamodb:Query"'
        ) @($bidderEventsIndex)
        Assert-ExactStatement $queryPolicy 'QueryCategories' @(
            '"dynamodb:Query"'
        ) @(
            'data.terraform_remote_state.data.outputs.category_catalog_table_arn',
            '"${data.terraform_remote_state.data.outputs.category_catalog_table_arn}/index/${data.terraform_remote_state.data.outputs.category_catalog_status_index_name}"'
        )
        Assert-ExactStatement $queryPolicy 'ReadCategory' @(
            '"dynamodb:GetItem"'
        ) @(
            'data.terraform_remote_state.data.outputs.category_catalog_table_arn'
        )
    }

    It 'grants admin only the item actions used on each table' {
        (Get-HclBlocks $adminPolicy 'statement').Count | Should Be 10
        Assert-ExactStatement $adminPolicy 'ManageCatalogItems' @(
            '"dynamodb:GetItem"',
            '"dynamodb:UpdateItem"'
        ) @($catalog)
        Assert-ExactStatement $adminPolicy 'ManageAuctionState' @(
            '"dynamodb:GetItem"',
            '"dynamodb:PutItem"',
            '"dynamodb:UpdateItem"'
        ) @($itemState)
        Assert-ExactStatement $adminPolicy 'WriteBidEvents' @(
            '"dynamodb:PutItem"'
        ) @($bidEvents)
        Assert-ExactStatement $adminPolicy 'QueryCatalogRecords' @(
            '"dynamodb:Query"'
        ) @($catalog, $catalogGsi2)
        Assert-ExactStatement $adminPolicy 'ManageCognitoUsers' @(
            '"cognito-idp:AdminDisableUser"',
            '"cognito-idp:AdminEnableUser"',
            '"cognito-idp:AdminGetUser"',
            '"cognito-idp:AdminListGroupsForUser"',
            '"cognito-idp:AdminCreateUser"',
            '"cognito-idp:AdminAddUserToGroup"',
            '"cognito-idp:ListUsers"'
        ) @('data.terraform_remote_state.identity[0].outputs.cognito_user_pool_arn')
        Assert-ExactStatement $adminPolicy 'ManageAdminCatalog' @(
            '"dynamodb:GetItem"',
            '"dynamodb:PutItem"',
            '"dynamodb:UpdateItem"',
            '"dynamodb:Query"',
            '"dynamodb:Scan"'
        ) @(
            'data.terraform_remote_state.data.outputs.category_catalog_table_arn',
            '"${data.terraform_remote_state.data.outputs.category_catalog_table_arn}/index/${data.terraform_remote_state.data.outputs.category_catalog_slug_index_name}"',
            'data.terraform_remote_state.data.outputs.admin_audit_events_table_arn',
            '"${data.terraform_remote_state.data.outputs.admin_audit_events_table_arn}/index/${data.terraform_remote_state.data.outputs.admin_audit_events_actor_index_name}"',
            '"${data.terraform_remote_state.data.outputs.admin_audit_events_table_arn}/index/${data.terraform_remote_state.data.outputs.admin_audit_events_resource_index_name}"'
        )
        Assert-ExactStatement $adminPolicy 'QueryCategories' @(
            '"dynamodb:Query"'
        ) @(
            'data.terraform_remote_state.data.outputs.category_catalog_table_arn',
            '"${data.terraform_remote_state.data.outputs.category_catalog_table_arn}/index/${data.terraform_remote_state.data.outputs.category_catalog_status_index_name}"'
        )
    }

    It 'scopes admin Scheduler management to its schedule group' {
        Assert-ExactStatement $adminPolicy 'ManageSchedules' @(
            '"scheduler:GetSchedule"',
            '"scheduler:CreateSchedule"',
            '"scheduler:DeleteSchedule"'
        ) @('local.stage3_schedule_resource_arn')
    }

    It 'scopes admin PassRole to the exact role and service condition' {
        Assert-ExactStatement $adminPolicy 'PassSchedulerRole' @(
            '"iam:PassRole"'
        ) @(
            'data.terraform_remote_state.messaging.outputs.scheduler_role_arn'
        )
        $statement = Get-PolicyStatement $adminPolicy 'PassSchedulerRole'
        $conditions = @(Get-HclBlocks $statement 'condition')

        $conditions.Count | Should Be 1
        (Get-HclAssignmentValue $conditions[0] 'test') |
            Should Be '"StringEquals"'
        (Get-HclAssignmentValue $conditions[0] 'variable') |
            Should Be '"iam:PassedToService"'
        (Test-ExactHclList `
            (Get-HclAssignmentValue $conditions[0] 'values') `
            @('"scheduler.amazonaws.com"')) | Should Be $true

        foreach ($name in @('session_service', 'item_service', 'query_service')) {
            $policy = Get-HclBlock $all (
                'data\s+"aws_iam_policy_document"\s+"' + $name + '"'
            )
            $policy | Should Not Match '(?i)iam:PassRole'
        }
    }

    It 'checks every gated IAM document and resource module-wide for wildcards' {
        $stage3IamBlocks = @()
        foreach ($match in [regex]::Matches(
            $all,
            '(data|resource)\s+"(aws_iam_[^"]+)"\s+"([^"]+)"\s*\{'
        )) {
            $block = Get-HclBlock $all (
                $match.Groups[1].Value + '\s+"' +
                [regex]::Escape($match.Groups[2].Value) + '"\s+"' +
                [regex]::Escape($match.Groups[3].Value) + '"'
            )
            if ($block -match 'var\.enable_stage3') {
                $stage3IamBlocks += $block
            }
        }

        foreach ($block in $stage3IamBlocks) {
            $block | Should Not Match (
                '(?is)(?:actions?|Action)\s*=\s*(?:' +
                '"[^"]*\*[^"]*"|\[[^\]]*"[^"]*\*[^"]*")'
            )
            $block | Should Not Match `
                '(?is)(?:resources?|Resource)\s*=\s*(?:"\*"|\[\s*"\*")'
        }
        $stage3IamBlocks.Count | Should Be 12

        $stage3PolicyDocuments = @()
        foreach ($match in [regex]::Matches(
            $all,
            'data\s+"aws_iam_policy_document"\s+"([^"]+)"\s*\{'
        )) {
            $policy = Get-HclBlock $all (
                'data\s+"aws_iam_policy_document"\s+"' +
                [regex]::Escape($match.Groups[1].Value) + '"'
            )
            if ($policy -match 'var\.enable_stage3') {
                $stage3PolicyDocuments += $policy
            }
        }

        foreach ($policy in $stage3PolicyDocuments) {
            (Test-IamPolicyDocumentMergeBypass $policy) | Should Be $false
            foreach ($statement in @(Get-HclBlocks $policy 'statement')) {
                foreach ($action in @(Get-HclListItems `
                    (Get-HclAssignmentValue $statement 'actions'))) {
                    $action | Should Not Match '\*'
                }
                @(Get-HclListItems `
                    (Get-HclAssignmentValue $statement 'resources')) |
                    Where-Object { $_ -ceq '"*"' } |
                    Measure-Object |
                    Select-Object -ExpandProperty Count |
                    Should Be 0
            }
        }
        $stage3PolicyDocuments.Count | Should Be 4
        ($stage3PolicyDocuments -join "`n") | Should Not Match `
            '(?i)dynamodb:TransactWriteItems'
    }

    It 'rejects role inline managed and attachment policy bypasses module-wide' {
        foreach ($name in $functionNames) {
            $role = Get-HclBlock $all (
                'resource\s+"aws_iam_role"\s+"' + $name + '"'
            )
            (Test-IamRolePolicyBypass $role) | Should Be $false
        }
        $all | Should Not Match `
            'resource\s+"aws_iam_[^"]*policy_attachment[^"]*"'
    }

    It 'detects literal and dynamic inline role policy mutation fixtures' {
        $literal = @'
resource "aws_iam_role" "mutated" {
  inline_policy {
    name   = "bypass"
    policy = "{}"
  }
}
'@
        $dynamic = @'
resource "aws_iam_role" "mutated" {
  dynamic "inline_policy" {
    for_each = [1]
    content {
      name   = "bypass"
      policy = "{}"
    }
  }
}
'@

        (Test-IamRolePolicyBypass $literal) | Should Be $true
        (Test-IamRolePolicyBypass $dynamic) | Should Be $true
    }

    It 'detects a source policy document merge mutation fixture' {
        $fixture = @'
data "aws_iam_policy_document" "mutated" {
  source_policy_documents = [data.aws_iam_policy_document.bypass.json]
}
'@

        (Test-IamPolicyDocumentMergeBypass $fixture) | Should Be $true
    }

    It 'detects an override policy document merge mutation fixture' {
        $fixture = @'
data "aws_iam_policy_document" "mutated" {
  override_policy_documents = [data.aws_iam_policy_document.bypass.json]
}
'@

        (Test-IamPolicyDocumentMergeBypass $fixture) | Should Be $true
    }

    It 'rejects known action resource and condition list bypass shapes' {
        foreach ($actions in @(
            '["dynamodb:GetItem", "dynamodb:DeleteItem"]',
            '["dynamodb:GetItem", "*"]',
            '["dynamodb:GetItem*"]'
        )) {
            Test-ExactHclList $actions @('"dynamodb:GetItem"') |
                Should Be $false
        }
        foreach ($resources in @(
            '[local.stage3_schedule_resource_arn, "*"]',
            '[local.stage3_schedule_resource_arn, local.other_arn]',
            '["${local.stage3_schedule_resource_arn}*"]'
        )) {
            Test-ExactHclList $resources `
                @('local.stage3_schedule_resource_arn') | Should Be $false
        }
        foreach ($values in @(
            '["scheduler.amazonaws.com", "lambda.amazonaws.com"]',
            '["scheduler.amazonaws.com", "*"]',
            '["scheduler.amazonaws.com*"]'
        )) {
            Test-ExactHclList $values @('"scheduler.amazonaws.com"') |
                Should Be $false
        }
    }
}

Describe 'Stage 3 Scheduler invocation and watchdog' {
    It 'allows only Scheduler from the exact account and schedule group' {
        $permission = Get-HclBlock $stage3 `
            'resource\s+"aws_lambda_permission"\s+"admin_scheduler"'

        $permission | Should Match `
            'count\s*=\s*var\.enable_stage3\s*\?\s*1\s*:\s*0'
        (Get-HclAssignmentValue $permission 'action') |
            Should Be '"lambda:InvokeFunction"'
        (Get-HclAssignmentValue $permission 'function_name') |
            Should Be 'aws_lambda_function.admin_command[0].function_name'
        (Get-HclAssignmentValue $permission 'principal') |
            Should Be '"scheduler.amazonaws.com"'
        (Get-HclAssignmentValue $permission 'source_account') |
            Should Be 'data.aws_caller_identity.current.account_id'
        (Get-HclAssignmentValue $permission 'source_arn') |
            Should Be `
                'data.terraform_remote_state.messaging.outputs.scheduler_group_arn'
        $permission | Should Not Match '(?m)^\s*principal\s*=\s*\['
    }

    It 'rejects known Scheduler principal bypass shapes' {
        foreach ($principal in @(
            '["scheduler.amazonaws.com", "events.amazonaws.com"]',
            '"*"',
            '"scheduler.amazonaws.com*"'
        )) {
            $principal -ceq '"scheduler.amazonaws.com"' | Should Be $false
        }
    }

    It 'creates the exact recurring lifecycle watchdog target' {
        $schedule = Get-HclBlock $stage3 `
            'resource\s+"aws_scheduler_schedule"\s+"lifecycle_watchdog"'
        $window = Get-HclBlock $schedule 'flexible_time_window'
        $target = Get-HclBlock $schedule 'target'
        $deadLetter = Get-HclBlock $target 'dead_letter_config'
        $retry = Get-HclBlock $target 'retry_policy'

        $schedule | Should Match `
            'count\s*=\s*var\.enable_stage3\s*\?\s*1\s*:\s*0'
        (Get-HclAssignmentValue $schedule 'name') |
            Should Be '"${var.name_prefix}-lifecycle-watchdog"'
        (Get-HclAssignmentValue $schedule 'group_name') |
            Should Be `
                'data.terraform_remote_state.messaging.outputs.scheduler_group_name'
        (Get-HclAssignmentValue $schedule 'schedule_expression') |
            Should Be '"rate(1 minute)"'
        (Get-HclAssignmentValue $window 'mode') | Should Be '"OFF"'
        (Get-HclAssignmentValue $target 'arn') |
            Should Be 'aws_lambda_function.admin_command[0].arn'
        (Get-HclAssignmentValue $target 'role_arn') |
            Should Be `
                'data.terraform_remote_state.messaging.outputs.scheduler_role_arn'
        (Normalize-HclExpression `
            (Get-HclAssignmentValue $target 'input')) |
            Should Be 'jsonencode({command="WATCHDOG_SWEEP"})'
        (Get-HclAssignmentValue $deadLetter 'arn') |
            Should Be `
                'data.terraform_remote_state.messaging.outputs.scheduler_dlq_arn'
        (Get-HclAssignmentValue $retry 'maximum_event_age_in_seconds') |
            Should Be '3600'
        (Get-HclAssignmentValue $retry 'maximum_retry_attempts') |
            Should Be '3'
        $schedule | Should Not Match '(?i)action_after_completion'

        (Test-ExactHclList `
            (Get-HclAssignmentValue $schedule 'depends_on') `
            @(
                'aws_lambda_function.admin_command[0]',
                'aws_lambda_permission.admin_scheduler[0]'
            )) | Should Be $true
    }
}

Describe 'Stage 3 output and scope boundaries' {
    It 'exports one exact conditional function map' {
        $output = Get-HclBlock $outputs 'output\s+"stage3_functions"'
        $expected = (
            'output"stage3_functions"{' +
            'value=var.enable_stage3?{' +
            'session_service={' +
            'name=aws_lambda_function.session_service[0].function_name' +
            'arn=aws_lambda_function.session_service[0].arn' +
            'invoke_arn=aws_lambda_function.session_service[0].invoke_arn}' +
            'item_service={' +
            'name=aws_lambda_function.item_service[0].function_name' +
            'arn=aws_lambda_function.item_service[0].arn' +
            'invoke_arn=aws_lambda_function.item_service[0].invoke_arn}' +
            'query_service={' +
            'name=aws_lambda_function.query_service[0].function_name' +
            'arn=aws_lambda_function.query_service[0].arn' +
            'invoke_arn=aws_lambda_function.query_service[0].invoke_arn}' +
            'admin_command={' +
            'name=aws_lambda_function.admin_command[0].function_name' +
            'arn=aws_lambda_function.admin_command[0].arn' +
            'invoke_arn=aws_lambda_function.admin_command[0].invoke_arn}' +
            '}:{}' +
            '}'
        )

        (Normalize-HclExpression $output) | Should Be $expected
        ([regex]::Matches(
            $outputs,
            'output\s+"stage3_functions"'
        )).Count | Should Be 1
        $outputs | Should Not Match `
            'output\s+"(?:session_service|item_service|query_service|admin_command)'
    }

    It 'exports the single configured CORS origin without a secret value' {
        $output = Get-HclBlock $outputs `
            'output\s+"stage3_cors_allowed_origin"'

        (Normalize-HclExpression `
            (Get-HclAssignmentValue $output 'value')) |
            Should Be 'var.stage3_cors_allowed_origin'
        $output | Should Not Match '(?i)sensitive\s*=\s*false|api.?key|secret'
    }

    It 'gates every non-legacy resource and data block module-wide' {
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
            $block | Should Match `
                'count\s*=\s*var\.enable_stage3\s*\?\s*1\s*:\s*0'
        }
    }

    It 'uses only explicitly approved addresses across every root Terraform file' {
        $actual = @([regex]::Matches(
            $all,
            '(resource|data)\s+"([^"]+)"\s+"([^"]+)"\s*\{'
        ) | ForEach-Object {
            "$($_.Groups[1].Value).$($_.Groups[2].Value)." +
                $_.Groups[3].Value
        })
        $approved = @($legacyAddresses) + @($stage3Addresses)

        (($actual | Sort-Object) -join '|') |
            Should Be (($approved | Sort-Object) -join '|')
    }

    It 'leaves only the exact Stage 1 and 2 inventory in the legacy parent' {
        $actual = @([regex]::Matches(
            $parentAll,
            '(resource|data)\s+"([^"]+)"\s+"([^"]+)"\s*\{'
        ) | ForEach-Object {
            "$($_.Groups[1].Value).$($_.Groups[2].Value)." +
                $_.Groups[3].Value
        })

        (($actual | Sort-Object) -join '|') |
            Should Be (($parentLegacyAddresses | Sort-Object) -join '|')
    }

    It 'removes every Stage 3 file variable and output from the legacy parent' {
        Test-Path -LiteralPath (Join-Path $parentRoot 'stage3.tf') |
            Should Be $false
        foreach ($name in @(
            'enable_stage3',
            'max_media_bytes',
            'stage3_cors_allowed_origin'
        )) {
            (Get-HclBlock $parentVariables ('variable\s+"' + $name + '"')) |
                Should Be ''
        }
        foreach ($name in @(
            'stage3_functions',
            'stage3_cors_allowed_origin'
        )) {
            (Get-HclBlock $parentOutputs ('output\s+"' + $name + '"')) |
                Should Be ''
        }
    }

    It 'rejects child modules Terraform JSON and teardown blockers' {
        $all | Should Not Match '(?m)^\s*module\s+"[^"]+"\s*\{'
        $terraformJsonFiles.Count | Should Be 0
        $raw | Should Not Match '\bprevent_destroy\b'
    }

    It 'introduces no out of scope network database stream or container resources' {
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

    It 'preserves all legacy functions event source and shared layer topology' {
        foreach ($name in @(
            'bid_processor',
            'ws_authorizer',
            'ws_handler',
            'broadcast'
        )) {
            $function = Get-HclBlock $parentMain (
                'resource\s+"aws_lambda_function"\s+"' + $name + '"'
            )
            $function.Length | Should BeGreaterThan 0
            $function | Should Not Match '\bcount\s*='
            $function | Should Match `
                'layers\s*=\s*\[aws_lambda_layer_version\.common\.arn\]'
        }
        $mapping = Get-HclBlock $parentMain `
            'resource\s+"aws_lambda_event_source_mapping"\s+"bid"'
        $mapping | Should Match `
            'event_source_arn\s*=\s*data\.terraform_remote_state\.messaging\.outputs\.bid_commands_queue_arn'
        $mapping | Should Match `
            'function_name\s*=\s*aws_lambda_function\.bid_processor\.arn'
        $mapping | Should Match `
            'function_response_types\s*=\s*\["ReportBatchItemFailures"\]'
        $mapping | Should Not Match '\bcount\s*='

        $layer = Get-HclBlock $parentMain `
            'resource\s+"aws_lambda_layer_version"\s+"common"'
        $layer | Should Match `
            'filename\s*=\s*"\$\{path\.module\}/\.\./\.\./backend/build/layer\.zip"'
        $layer | Should Not Match '\bcount\s*='
    }
}
