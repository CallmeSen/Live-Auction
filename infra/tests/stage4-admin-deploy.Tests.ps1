$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$scriptPath = Join-Path $repoRoot 'admin-frontend\deploy.ps1'
$source = if (Test-Path -LiteralPath $scriptPath) { Get-Content -Raw -LiteralPath $scriptPath } else { '' }

Describe 'Stage 4 admin deployment safety contract' {
    It 'pins the exact la-admin caller and defaults to read-only preflight' {
        $source | Should Match '\[switch\]\$Apply'
        $source | Should Match '\$AwsProfile\s*=\s*''la-admin'''
        $source | Should Match '\$AwsRegion\s*=\s*''ap-southeast-1'''
        $source | Should Match 'arn:aws:iam::233376973052:user/la-admin'
        $source | Should Match 'sts\s+get-caller-identity'
        $source | Should Match '--profile\s+\$AwsProfile'
        $source | Should Not Match '(?m)--profile\s+la(?!-)'
        $source | Should Match '(?s)if\s*\(\s*-not\s*\$Apply\s*\).*?return'
    }

    It 'uses admin edge outputs and the shared serverless handoff' {
        $source | Should Match 'admin_frontend_bucket_name'
        $source | Should Match 'admin_cloudfront_distribution_id'
        $source | Should Match 'admin_cloudfront_domain_name'
        $source | Should Match 'cloudfront_origin'
        $source | Should Match 'cognito_user_pool_id'
        $source | Should Match 'stage3_rest_invoke_url'
        $source | Should Match 'stage3_rest_api_key_id'
        $source | Should Match 'VITE_USER_APP_URL'
        $source | Should Match 'get-api-key'
        $source | Should Match '--include-value'
    }

    It 'gates build, upload, and invalidation behind Apply without writing env files' {
        $source | Should Match '(?s)if\s*\(\s*-not\s*\$Apply\s*\).*?npm\s+run\s+build'
        $source | Should Match '(?s)npm\s+run\s+build.*?aws\s+s3\s+sync'
        $source | Should Match '(?s)aws\s+s3\s+sync.*?aws\s+cloudfront\s+create-invalidation'
        $source | Should Match '\[Environment\]::SetEnvironmentVariable'
        $source | Should Not Match '(?i)(Set-Content|Out-File|Add-Content).*\.env'
        $source | Should Not Match '(?i)terraform.*destroy'
    }

    It 'does not print runtime secrets or use an admin URL in the user handoff' {
        $source | Should Not Match '(?i)(Write-Output|Write-Host|Write-Information|Write-Verbose).*?(token|secret|api.?key|password)'
        $source | Should Not Match 'VITE_ADMIN_APP_URL'
        $source | Should Match 'Restore-ProcessEnvironment'
    }
}
