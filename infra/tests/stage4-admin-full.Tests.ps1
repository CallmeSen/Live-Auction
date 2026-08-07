$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$contractPath = Join-Path $repoRoot 'docs\live-auction-planning\live-auction-admin-api-contract.md'
$dataPath = Join-Path $repoRoot 'infra\04-data\main.tf'
$outputsPath = Join-Path $repoRoot 'infra\04-data\outputs.tf'
$computePath = Join-Path $repoRoot 'infra\06-compute\stage3-control-plane\main.tf'

function Get-HclBlock([string]$Text, [string]$HeaderPattern) {
    $match = [regex]::Match($Text, "$HeaderPattern\s*\{")
    if (-not $match.Success) { return '' }
    $openBrace = $Text.IndexOf('{', $match.Index)
    $depth = 0
    $inString = $false
    $escaped = $false
    for ($index = $openBrace; $index -lt $Text.Length; $index++) {
        $current = $Text[$index]
        if ($current -eq '"' -and -not $escaped) { $inString = -not $inString }
        if (-not $inString) {
            if ($current -eq '{') { $depth++ }
            elseif ($current -eq '}') {
                $depth--
                if ($depth -eq 0) {
                    return $Text.Substring($match.Index, $index - $match.Index + 1)
                }
            }
        }
        if ($inString -and $current -eq '\' -and -not $escaped) { $escaped = $true }
        else { $escaped = $false }
    }
    return ''
}

$contract = if (Test-Path $contractPath) { Get-Content -Raw $contractPath } else { '' }
$data = Get-Content -Raw $dataPath
$outputs = Get-Content -Raw $outputsPath
$compute = Get-Content -Raw $computePath

Describe 'Full serverless Admin contract' {
    It 'freezes the required boundary and route vocabulary' {
        $contract | Should Match 'Status:\s+FROZEN'
        $contract | Should Match 'The only application groups are `USER` and `ADMIN`'
        $contract | Should Not Match '(?i)VITE_API_BASE_URL|UserListItemResponse|axiosClient'
        foreach ($route in @(
            '/api/v1/admin/users',
            '/api/v1/admin/admin-accounts',
            '/api/v1/categories',
            '/api/v1/admin/categories',
            '/api/v1/admin/audit-events',
            '/api/v1/admin/auction-sessions',
            '/api/v1/admin/items/{item_id}/approve'
        )) {
            $contract | Should Match ([regex]::Escape($route))
        }
    }

    It 'defines Cognito status, archive, pagination, and audit safety rules' {
        $contract | Should Match '(?s)status=ACTIVE.*?AdminEnableUser'
        $contract | Should Match '(?s)status=BANNED.*?AdminDisableUser'
        $contract | Should Match 'status.*ACTIVE.*INACTIVE.*soft operation'
        $contract | Should Match 'opaque token'
        $contract | Should Match '(?s)actor_sub.*?action.*?resource_type.*?resource_id.*?outcome.*?request_id'
        $contract | Should Match '(?s)Passwords.*?never in a\s+response, log entry, or audit event'
    }
}

Describe 'Full serverless Admin data model' {
    It 'adds only gated category and audit tables' {
        $category = Get-HclBlock $data 'resource\s+"aws_dynamodb_table"\s+"category_catalog"'
        $audit = Get-HclBlock $data 'resource\s+"aws_dynamodb_table"\s+"admin_audit_events"'

        $category | Should Match 'count\s*=\s*var\.enable_stage3\s*\?\s*1\s*:\s*0'
        $category | Should Match 'hash_key\s*=\s*"category_id"'
        $category | Should Match 'name\s*=\s*local\.table_names\.category_catalog'
        $category | Should Match 'global_secondary_index'
        $category | Should Match 'name\s*=\s*"slug-index"'
        $category | Should Match 'point_in_time_recovery\s*\{'

        $audit | Should Match 'count\s*=\s*var\.enable_stage3\s*\?\s*1\s*:\s*0'
        $audit | Should Match 'hash_key\s*=\s*"pk"'
        $audit | Should Match 'range_key\s*=\s*"sk"'
        $audit | Should Match 'ttl\s*\{\s*attribute_name\s*=\s*"expires_at"'
        $audit | Should Match 'actor-index'
        $audit | Should Match 'resource-index'
        $audit | Should Match 'point_in_time_recovery\s*\{'
    }

    It 'exports table names and ARNs without secret values' {
        foreach ($name in @(
            'category_catalog_table_name',
            'category_catalog_table_arn',
            'admin_audit_events_table_name',
            'admin_audit_events_table_arn'
        )) {
            $outputs | Should Match ('output\s+"' + $name + '"')
        }
        $outputs | Should Not Match '(?i)api_key_value|secret|password'
    }
}

Describe 'Admin compute data wiring' {
    It 'passes category and audit table names to the control plane' {
        $compute | Should Match 'TBL_CATEGORY_CATALOG'
        $compute | Should Match 'TBL_ADMIN_AUDIT_EVENTS'
        $compute | Should Match 'category_catalog_table_name'
        $compute | Should Match 'admin_audit_events_table_name'
    }

    It 'requires a non-empty bootstrap Admin when the control plane is enabled' {
        $compute | Should Match 'trimspace\(var\.bootstrap_admin_sub\)\s*!=\s*""'
        $compute | Should Match 'bootstrap_admin_sub must be configured'
    }
}
