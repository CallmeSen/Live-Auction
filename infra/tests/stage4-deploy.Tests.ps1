$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$scriptPath = Join-Path $repoRoot 'frontend\deploy.ps1'
$source = if (Test-Path -LiteralPath $scriptPath) {
    Get-Content -Raw -LiteralPath $scriptPath
} else {
    ''
}

Describe 'Stage 4 deployment safety contract' {
    It 'defines an explicit apply switch and exact caller boundary' {
        $source | Should Match '\[switch\]\$Apply'
        $source | Should Match '\$AwsProfile\s*=\s*''la-admin'''
        $source | Should Match '\$AwsRegion\s*=\s*''ap-southeast-1'''
        $source | Should Match '233376973052'
        $source | Should Match 'arn:aws:iam::233376973052:user/la-admin'
        $source | Should Match 'sts\s+get-caller-identity'
        $source | Should Match '--profile\s+\$AwsProfile'
        $source | Should Not Match '(?m)--profile\s+la(?!-)'
    }

    It 'defaults to read-only preflight and gates mutations behind Apply' {
        $source | Should Match '(?s)if\s*\(\s*-not\s*\$Apply\s*\).*?return'
        $source | Should Match '(?s)if\s*\(\s*-not\s*\$Apply\s*\).*?npm\s+run\s+build'
        $source | Should Match '(?s)npm\s+run\s+build.*?aws\s+s3\s+sync'
        $source | Should Match '(?s)aws\s+s3\s+sync.*?aws\s+cloudfront\s+create-invalidation'
        $source | Should Match 'Get-TerraformOutput'
        $source | Should Match '\$TerraformOutputAttempts\s*=\s*3'
        $source | Should Match '(?s)function Get-TerraformOutput.*?for\s*\(\$attempt\s*=\s*1;.*?\$TerraformOutputAttempts.*?Start-Sleep\s+-Seconds\s+\$attempt'
        $source | Should Match 'stage3_rest_api_key_id'
        $source | Should Match 'get-api-key'
        $source | Should Match '--include-value'
    }

    It 'uses process-scoped runtime values and restores them' {
        $source | Should Match '\[Environment\]::SetEnvironmentVariable'
        $source | Should Match '(?s)try\s*\{.*?npm\s+run\s+build.*?finally\s*\{.*?SetEnvironmentVariable'
        $source | Should Not Match '(?i)(Set-Content|Out-File|Add-Content).*\.env'
    }

    It 'publishes JavaScript assets with a browser-executable module MIME type' {
        $source | Should Match '(?s)aws\s+s3\s+sync.*?aws\s+s3\s+cp'
        $source | Should Match "--include\s+'\*\.js'"
        $source | Should Match '--content-type\s+text/javascript'
        $source | Should Match '--metadata-directive\s+REPLACE'
    }

    It 'rejects unsafe or incomplete handoff values' {
        $source | Should Match 'if\s*\(\s*\[string\]::IsNullOrWhiteSpace'
        $source | Should Match '(?i)reject|invalid|empty'
        $source | Should Match 'cloudfront_distribution_id'
        $source | Should Match 'frontend_bucket_name'
        $source | Should Not Match '(?i)terraform.*destroy'
        $source | Should Not Match '(?i)(Write-Host|Write-Output|Write-Information|Write-Verbose).*?(token|secret|api.?key|password)'
    }
}
