$repoRoot = Split-Path -Parent $PSScriptRoot
$moduleRoot = Join-Path $repoRoot '05-messaging'

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

    $end = $start
    while (
        $end -lt $Text.Length -and
        $Text[$end] -ne "`r" -and
        $Text[$end] -ne "`n" -and
        $Text[$end] -ne ',' -and
        $Text[$end] -ne ']' -and
        $Text[$end] -ne '}'
    ) {
        $end++
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
        if ($actual[$index].Contains('*')) {
            return $false
        }
        if ($actual[$index] -cne $Expected[$index]) {
            return $false
        }
    }
    return $true
}

function Get-RootTerraformJsonFiles([string]$Path) {
    return @(Get-ChildItem -LiteralPath $Path -Filter '*.tf.json' -File |
        Sort-Object FullName)
}

$terraformFiles = @(Get-ChildItem -LiteralPath $moduleRoot -Filter '*.tf' -File |
    Sort-Object FullName)
$terraformJsonFiles = @(Get-RootTerraformJsonFiles $moduleRoot)
$raw = ($terraformFiles | ForEach-Object {
    Get-Content -Raw -LiteralPath $_.FullName
}) -join "`n"
$all = Remove-HclComments $raw
$main = Remove-HclComments (Get-Content -Raw -LiteralPath `
    (Join-Path $moduleRoot 'main.tf'))
$variables = Remove-HclComments (Get-Content -Raw -LiteralPath `
    (Join-Path $moduleRoot 'variables.tf'))
$outputs = Remove-HclComments (Get-Content -Raw -LiteralPath `
    (Join-Path $moduleRoot 'outputs.tf'))

Describe 'Stage 3 messaging Terraform parsing and inputs' {
    It 'parses every Terraform file in the messaging module' {
        $terraformFiles.Count | Should BeGreaterThan 0
        foreach ($file in $terraformFiles) {
            (Get-Content -Raw -LiteralPath $file.FullName).Length |
                Should BeGreaterThan 0
        }
    }

    It 'defaults the Stage 3 resource gate to false' {
        $gate = Get-HclBlock $variables 'variable\s+"enable_stage3"'

        $gate | Should Match 'type\s*=\s*bool'
        $gate | Should Match 'default\s*=\s*false'
    }

    It 'limits the shared name prefix to the tightest resource contract' {
        $input = Get-HclBlock $variables 'variable\s+"name_prefix"'

        $input | Should Match `
            'description\s*=\s*"[^"\r\n]*1[^"\r\n]*47[^"\r\n]*ASCII[^"\r\n]*"'
        $input | Should Match 'type\s*=\s*string'
        $input | Should Match 'default\s*=\s*"la"'
        $input | Should Match 'length\(var\.name_prefix\)\s*>=\s*1'
        $input | Should Match 'length\(var\.name_prefix\)\s*<=\s*47'
        $input | Should Match (
            'can\(regex\("\^\[A-Za-z0-9\]' +
            '\[A-Za-z0-9_-\]\{0,46\}\$",\s*var\.name_prefix\)\)'
        )
        $input | Should Match `
            'error_message\s*=\s*"[^"\r\n]*1[^"\r\n]*47[^"\r\n]*(?:letter|alphanumeric)[^"\r\n]*(?:hyphen|underscore)[^"\r\n]*"'
    }

    It 'accepts only the exact name prefix length and character set' {
        $input = Get-HclBlock $variables 'variable\s+"name_prefix"'
        $pattern = [regex]::Match(
            $input,
            'can\(regex\("([^"\r\n]+)",\s*var\.name_prefix\)\)'
        ).Groups[1].Value
        $pattern = '(?-i)' + $pattern.Replace('\\', '\')

        foreach ($valid in @(
            'a',
            '9',
            'Auction_9-prod',
            ('a' + ('b' * 46))
        )) {
            $valid | Should Match $pattern
        }
        foreach ($invalid in @(
            '',
            '_auction',
            '-auction',
            'auction.name',
            'auction name',
            'auction/name',
            'auction:name',
            ('auction' + [char]0x00E9),
            ('a' + ('b' * 47))
        )) {
            $invalid | Should Not Match $pattern
        }
    }

    It 'validates the Scheduler maximum event age' {
        $input = Get-HclBlock $variables `
            'variable\s+"scheduler_maximum_event_age_seconds"'

        $input | Should Match 'type\s*=\s*number'
        $input | Should Match 'default\s*=\s*3600'
        $input | Should Match 'validation\s*\{'
        $input | Should Match `
            'var\.scheduler_maximum_event_age_seconds\s*>=\s*60'
        $input | Should Match `
            'var\.scheduler_maximum_event_age_seconds\s*<=\s*86400'
        $input | Should Match `
            'floor\(var\.scheduler_maximum_event_age_seconds\)\s*==\s*var\.scheduler_maximum_event_age_seconds'
        $input | Should Match 'error_message\s*=\s*"[^"\r\n]+"'
    }

    It 'validates the Scheduler maximum retry attempts' {
        $input = Get-HclBlock $variables `
            'variable\s+"scheduler_maximum_retry_attempts"'

        $input | Should Match 'type\s*=\s*number'
        $input | Should Match 'default\s*=\s*3'
        $input | Should Match 'validation\s*\{'
        $input | Should Match `
            'var\.scheduler_maximum_retry_attempts\s*>=\s*0'
        $input | Should Match `
            'var\.scheduler_maximum_retry_attempts\s*<=\s*185'
        $input | Should Match `
            'floor\(var\.scheduler_maximum_retry_attempts\)\s*==\s*var\.scheduler_maximum_retry_attempts'
        $input | Should Match 'error_message\s*=\s*"[^"\r\n]+"'
    }

    It 'validates the Scheduler DLQ retention period' {
        $input = Get-HclBlock $variables `
            'variable\s+"scheduler_dlq_retention_seconds"'

        $input | Should Match 'type\s*=\s*number'
        $input | Should Match 'default\s*=\s*1209600'
        $input | Should Match 'validation\s*\{'
        $input | Should Match `
            'var\.scheduler_dlq_retention_seconds\s*>=\s*60'
        $input | Should Match `
            'var\.scheduler_dlq_retention_seconds\s*<=\s*1209600'
        $input | Should Match `
            'floor\(var\.scheduler_dlq_retention_seconds\)\s*==\s*var\.scheduler_dlq_retention_seconds'
        $input | Should Match 'error_message\s*=\s*"[^"\r\n]+"'
    }
}

Describe 'Stage 3 Scheduler group and dead-letter queue' {
    BeforeEach {
        $script:group = Get-HclBlock $main `
            'resource\s+"aws_scheduler_schedule_group"\s+"main"'
        $script:schedulerDlq = Get-HclBlock $main `
            'resource\s+"aws_sqs_queue"\s+"scheduler_dlq"'
    }

    It 'creates a gated deterministic Scheduler group with a safe name' {
        $main | Should Match `
            'scheduler_group_name\s*=\s*"\$\{substr\(replace\(var\.name_prefix,\s*"/\[\^0-9A-Za-z_\.\-\]/",\s*"-"\),\s*0,\s*54\)\}-scheduler"'
        $group | Should Match `
            'count\s*=\s*var\.enable_stage3\s*\?\s*1\s*:\s*0'
        $group | Should Match 'name\s*=\s*local\.scheduler_group_name'
    }

    It 'creates a gated standard encrypted Scheduler DLQ' {
        $schedulerDlq | Should Match `
            'count\s*=\s*var\.enable_stage3\s*\?\s*1\s*:\s*0'
        $schedulerDlq | Should Match `
            'name\s*=\s*"\$\{var\.name_prefix\}-scheduler-dlq"'
        $schedulerDlq | Should Match `
            'message_retention_seconds\s*=\s*var\.scheduler_dlq_retention_seconds'
        $schedulerDlq | Should Match 'sqs_managed_sse_enabled\s*=\s*true'
        $schedulerDlq | Should Not Match '\bfifo_queue\s*='
        $schedulerDlq | Should Not Match '\bredrive_(?:policy|allow_policy)\s*='
    }

    It 'does not create recurring or one-time schedules' {
        $all | Should Not Match `
            'resource\s+"aws_scheduler_schedule"\s+"'
    }
}

Describe 'Stage 3 Scheduler invoke role' {
    BeforeEach {
        $script:caller = Get-HclBlock $main `
            'data\s+"aws_caller_identity"\s+"current"'
        $script:partition = Get-HclBlock $main `
            'data\s+"aws_partition"\s+"current"'
        $script:role = Get-HclBlock $main `
            'resource\s+"aws_iam_role"\s+"scheduler_invoke"'
        $script:policy = Get-HclBlock $main `
            'resource\s+"aws_iam_role_policy"\s+"scheduler_invoke"'
    }

    It 'gates identity data and derives the exact admin function ARN locally' {
        foreach ($block in @($caller, $partition)) {
            $block | Should Match `
                'count\s*=\s*var\.enable_stage3\s*\?\s*1\s*:\s*0'
        }
        $main | Should Match (
            'admin_function_arn\s*=\s*\(\s*var\.enable_stage3\s*\?\s*' +
            '"arn:\$\{' +
            'data\.aws_partition\.current\[0\]\.partition\}:lambda:' +
            '\$\{var\.aws_region\}:\$\{' +
            'data\.aws_caller_identity\.current\[0\]\.account_id\}:' +
            'function:\$\{var\.name_prefix\}-admin-command"\s*:\s*null\s*\)'
        )
        $all | Should Not Match 'terraform_remote_state|data\s+"aws_lambda_'
    }

    It 'does not index gated identity data when Stage 3 is disabled' {
        foreach ($name in @('admin_function_arn', 'scheduler_group_arn')) {
            $main | Should Match (
                '(?s)' + $name + '\s*=\s*\(\s*' +
                'var\.enable_stage3\s*\?.*?data\.aws_partition\.' +
                'current\[0\].*?data\.aws_caller_identity\.' +
                'current\[0\].*?:\s*null\s*\)'
            )
        }
    }

    It 'trusts only Scheduler from the exact account and schedule group' {
        $role | Should Match `
            'count\s*=\s*var\.enable_stage3\s*\?\s*1\s*:\s*0'
        $role | Should Match `
            'name\s*=\s*"\$\{var\.name_prefix\}-scheduler-invoke"'

        $document = Get-HclBlock $role `
            'assume_role_policy\s*=\s*jsonencode\('
        ([regex]::Matches(
            $document,
            '(?m)^\s*Statement\s*='
        )).Count | Should Be 1
        $statements = @(Get-HclListItems `
            (Get-HclAssignmentValue $document 'Statement'))
        $statements.Count | Should Be 1

        $statement = $statements[0]
        foreach ($field in @('Action', 'Principal', 'Condition')) {
            ([regex]::Matches(
                $statement,
                "(?m)^\s*$field\s*="
            )).Count | Should Be 1
        }
        (Get-HclAssignmentValue $statement 'Effect') |
            Should Be '"Allow"'
        (Get-HclAssignmentValue $statement 'Action') |
            Should Be '"sts:AssumeRole"'
        Normalize-HclExpression `
            (Get-HclAssignmentValue $statement 'Principal') |
            Should Be '{Service="scheduler.amazonaws.com"}'
        Normalize-HclExpression `
            (Get-HclAssignmentValue $statement 'Condition') |
            Should Be (
                '{StringEquals={' +
                '"aws:SourceAccount"=' +
                'data.aws_caller_identity.current[0].account_id' +
                '"aws:SourceArn"=local.scheduler_group_arn}}'
            )
    }

    It 'grants only exact Lambda invocation and DLQ delivery permissions' {
        $policy | Should Match `
            'count\s*=\s*var\.enable_stage3\s*\?\s*1\s*:\s*0'
        $policy | Should Match `
            'role\s*=\s*aws_iam_role\.scheduler_invoke\[0\]\.id'

        $document = Get-HclBlock $policy 'policy\s*=\s*jsonencode\('
        ([regex]::Matches(
            $document,
            '(?m)^\s*Statement\s*='
        )).Count | Should Be 1
        $statements = @(Get-HclListItems `
            (Get-HclAssignmentValue $document 'Statement'))
        $statements.Count | Should Be 2

        $invoke = @($statements | Where-Object {
            (Get-HclAssignmentValue $_ 'Sid') -eq '"InvokeAdminCommand"'
        })
        $delivery = @($statements | Where-Object {
            (Get-HclAssignmentValue $_ 'Sid') -eq '"SendToSchedulerDlq"'
        })
        $invoke.Count | Should Be 1
        $delivery.Count | Should Be 1

        foreach ($statement in @($invoke[0], $delivery[0])) {
            foreach ($field in @('Action', 'Resource')) {
                ([regex]::Matches(
                    $statement,
                    "(?m)^\s*$field\s*="
                )).Count | Should Be 1
            }
        }
        (Get-HclAssignmentValue $invoke[0] 'Effect') | Should Be '"Allow"'
        Test-ExactHclList `
            (Get-HclAssignmentValue $invoke[0] 'Action') `
            @('"lambda:InvokeFunction"') | Should Be $true
        Test-ExactHclList `
            (Get-HclAssignmentValue $invoke[0] 'Resource') `
            @('local.admin_function_arn') | Should Be $true

        (Get-HclAssignmentValue $delivery[0] 'Effect') | Should Be '"Allow"'
        Test-ExactHclList `
            (Get-HclAssignmentValue $delivery[0] 'Action') `
            @('"sqs:SendMessage"') | Should Be $true
        Test-ExactHclList `
            (Get-HclAssignmentValue $delivery[0] 'Resource') `
            @('aws_sqs_queue.scheduler_dlq[0].arn') | Should Be $true

        $document | Should Not Match '\*'
    }

    It 'rejects known IAM list and principal bypass shapes' {
        foreach ($actions in @(
            '["lambda:InvokeFunction", "lambda:GetFunction"]',
            '["lambda:InvokeFunction", "*"]',
            '["lambda:InvokeFunction*"]'
        )) {
            Test-ExactHclList $actions @('"lambda:InvokeFunction"') |
                Should Be $false
        }
        foreach ($resources in @(
            '[local.admin_function_arn, "*"]',
            '[local.admin_function_arn, local.other_arn]',
            '["local.admin_function_arn*"]'
        )) {
            Test-ExactHclList $resources @('local.admin_function_arn') |
                Should Be $false
        }

        Normalize-HclExpression `
            '{ Service = "scheduler.amazonaws.com" AWS = "*" }' |
            Should Not Be '{Service="scheduler.amazonaws.com"}'
        Normalize-HclExpression `
            '{ Service = ["scheduler.amazonaws.com", "events.amazonaws.com"] }' |
            Should Not Be '{Service="scheduler.amazonaws.com"}'
    }

    It 'contains no iam PassRole permission anywhere' {
        $raw | Should Not Match '(?i)iam:PassRole'
    }
}

Describe 'Stage 3 messaging outputs' {
    It 'returns null for every disabled Stage 3 output using try' {
        $expected = @{
            scheduler_group_name = `
                'aws_scheduler_schedule_group\.main\[0\]\.name'
            scheduler_group_arn = `
                'aws_scheduler_schedule_group\.main\[0\]\.arn'
            scheduler_role_arn = `
                'aws_iam_role\.scheduler_invoke\[0\]\.arn'
            scheduler_dlq_url = `
                'aws_sqs_queue\.scheduler_dlq\[0\]\.url'
            scheduler_dlq_arn = `
                'aws_sqs_queue\.scheduler_dlq\[0\]\.arn'
        }

        foreach ($name in $expected.Keys) {
            $output = Get-HclBlock $outputs "output\s+`"$name`""
            $output | Should Match (
                'value\s*=\s*var\.enable_stage3\s*\?\s*try\(' +
                $expected[$name] + ',\s*null\)\s*:\s*null'
            )
        }
    }
}

Describe 'Stage 3 messaging scope and Stage 1 preservation' {
    It 'gates every new resource and data block' {
        $stage1Addresses = @(
            'aws_sqs_queue.bid_dlq',
            'aws_sqs_queue.bid_commands'
        )

        foreach ($match in [regex]::Matches(
            $all,
            '(resource|data)\s+"([^"]+)"\s+"([^"]+)"\s*\{'
        )) {
            $type = $match.Groups[2].Value
            $name = $match.Groups[3].Value
            $address = "$type.$name"
            if ($stage1Addresses -notcontains $address) {
                $block = Get-HclBlock $all (
                    $match.Groups[1].Value + '\s+"' +
                    [regex]::Escape($type) + '"\s+"' +
                    [regex]::Escape($name) + '"'
                )
                $block | Should Match `
                    'count\s*=\s*var\.enable_stage3\s*\?\s*1\s*:\s*0'
            }
        }
    }

    It 'uses only approved resource and data addresses' {
        $approved = @(
            'resource.aws_sqs_queue.bid_dlq',
            'resource.aws_sqs_queue.bid_commands',
            'resource.aws_sqs_queue.scheduler_dlq',
            'resource.aws_scheduler_schedule_group.main',
            'resource.aws_iam_role.scheduler_invoke',
            'resource.aws_iam_role_policy.scheduler_invoke',
            'data.aws_caller_identity.current',
            'data.aws_partition.current'
        )

        foreach ($match in [regex]::Matches(
            $all,
            '(resource|data)\s+"([^"]+)"\s+"([^"]+)"\s*\{'
        )) {
            $address = "$($match.Groups[1].Value)." +
                "$($match.Groups[2].Value).$($match.Groups[3].Value)"
            (@($approved) -contains $address) | Should Be $true
        }
    }

    It 'rejects child modules and root Terraform JSON configurations' {
        $all | Should Not Match '(?m)^\s*module\s+"[^"]+"\s*\{'
        $terraformJsonFiles.Count | Should Be 0

        $fixture = Join-Path $TestDrive 'bypass.tf.json'
        Set-Content -LiteralPath $fixture -NoNewline -Value `
            '{"resource":{"terraform_data":{"bypass":{}}}}'
        $detected = @(Get-RootTerraformJsonFiles $TestDrive)
        $detected.Count | Should Be 1
        $detected[0].Name | Should Be 'bypass.tf.json'
    }

    It 'introduces no network relational compute Lambda or API resources' {
        $all | Should Not Match (
            '(?i)(?:resource|data)\s+"aws_(?:' +
            'vpc[^"\s]*|subnet[^"\s]*|nat_gateway[^"\s]*|' +
            'route_table[^"\s]*|internet_gateway[^"\s]*|' +
            'security_group[^"\s]*|lb(?:_[^"\s]*)?|' +
            'rds[^"\s]*|db_[^"\s]*|aurora[^"\s]*|' +
            'ecs[^"\s]*|ecr[^"\s]*|ec2[^"\s]*|' +
            'lambda[^"\s]*|api_gateway[^"\s]*|apigatewayv2[^"\s]*' +
            ')"'
        )
        $all | Should Not Match '(?i)\bvpc_config\b|\baurora\b'
    }

    It 'keeps Stage 3 teardown possible throughout raw HCL' {
        $raw | Should Not Match '\bprevent_destroy\b'
    }

    It 'preserves the Stage 1 FIFO queues and redrive topology' {
        $bidDlq = Get-HclBlock $main `
            'resource\s+"aws_sqs_queue"\s+"bid_dlq"'
        $bidCommands = Get-HclBlock $main `
            'resource\s+"aws_sqs_queue"\s+"bid_commands"'

        $bidDlq | Should Match 'name\s*=\s*local\.queue_names\.bid_dlq'
        $bidDlq | Should Match 'fifo_queue\s*=\s*true'
        $bidDlq | Should Match `
            'message_retention_seconds\s*=\s*var\.dlq_message_retention_seconds'
        $bidDlq | Should Not Match '\bcount\s*='
        $bidCommands | Should Match `
            'name\s*=\s*local\.queue_names\.bid_commands'
        $bidCommands | Should Match 'fifo_queue\s*=\s*true'
        $bidCommands | Should Match `
            'deadLetterTargetArn\s*=\s*aws_sqs_queue\.bid_dlq\.arn'
        $bidCommands | Should Match `
            'maxReceiveCount\s*=\s*var\.max_receive_count'
        $bidCommands | Should Not Match '\bcount\s*='
    }

    It 'preserves all Stage 1 messaging outputs' {
        $expected = @{
            bid_commands_queue_url = 'aws_sqs_queue\.bid_commands\.url'
            bid_commands_queue_arn = 'aws_sqs_queue\.bid_commands\.arn'
            bid_commands_dlq_url = 'aws_sqs_queue\.bid_dlq\.url'
            bid_commands_dlq_arn = 'aws_sqs_queue\.bid_dlq\.arn'
        }

        foreach ($name in $expected.Keys) {
            $output = Get-HclBlock $outputs "output\s+`"$name`""
            $output | Should Match "value\s*=\s*$($expected[$name])"
        }
    }
}
