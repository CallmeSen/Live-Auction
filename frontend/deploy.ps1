[CmdletBinding()]
param(
    [switch]$Apply
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$AwsProfile = 'la-admin'
$AwsRegion = 'ap-southeast-1'
$ExpectedAccount = '233376973052'
$ExpectedArn = 'arn:aws:iam::233376973052:user/la-admin'
$RepoRoot = Split-Path -Parent $PSScriptRoot
$FrontendRoot = $PSScriptRoot
$TerraformOutputAttempts = 3
$EdgeRoot = Join-Path $RepoRoot 'infra\09-edge'
$IdentityRoot = Join-Path $RepoRoot 'infra\03-identity'
$ApiRoot = Join-Path $RepoRoot 'infra\07-api'
$RequiredOutputNames = @(
    'frontend_bucket_name',
    'cloudfront_distribution_id',
    'cognito_user_pool_id',
    'cognito_client_id',
    'stage3_rest_invoke_url',
    'stage3_rest_api_key_id',
    'websocket_url',
    'media_cloudfront_origin',
    'media_cloudfront_distribution_id'
)
$RuntimeNames = @(
    'VITE_AWS_REGION',
    'VITE_COGNITO_USER_POOL_ID',
    'VITE_COGNITO_CLIENT_ID',
    'VITE_REST_API_URL',
    'VITE_REST_API_KEY',
    'VITE_WS_URL',
    'VITE_MEDIA_BASE_URL'
)

function Invoke-AwsJson {
    param(
        [Parameter(Mandatory)]
        [string[]]$Arguments
    )

    $json = & aws @Arguments --profile $AwsProfile --region $AwsRegion --output json
    if ($LASTEXITCODE -ne 0) {
        throw 'AWS command failed.'
    }
    return ($json -join "`n" | ConvertFrom-Json)
}

function Get-TerraformOutput {
    param(
        [Parameter(Mandatory)]
        [string]$ModuleRoot,
        [Parameter(Mandatory)]
        [string]$Name
    )

    if (-not (Test-Path -LiteralPath $ModuleRoot)) {
        throw "Terraform module is missing: $Name"
    }
    $raw = @()
    $exitCode = 1
    for ($attempt = 1; $attempt -le $TerraformOutputAttempts; $attempt++) {
        $previousPreference = $ErrorActionPreference
        try {
            $ErrorActionPreference = 'Continue'
            $raw = & terraform "-chdir=$ModuleRoot" output -raw $Name 2>$null
            $exitCode = $LASTEXITCODE
        }
        finally {
            $ErrorActionPreference = $previousPreference
        }
        if ($exitCode -eq 0) {
            break
        }
        if ($attempt -lt $TerraformOutputAttempts) {
            Start-Sleep -Seconds $attempt
        }
    }
    if ($exitCode -ne 0) {
        throw "Terraform output is unavailable after $TerraformOutputAttempts attempts: $Name"
    }
    $value = ($raw -join "`n").Trim()
    if ([string]::IsNullOrWhiteSpace($value)) {
        throw "Terraform output is empty: $Name"
    }
    return $value
}

function Assert-HandoffValue {
    param(
        [Parameter(Mandatory)]
        [string]$Name,
        [AllowEmptyString()]
        [string]$Value,
        [Parameter(Mandatory)]
        [string]$Pattern
    )

    if ([string]::IsNullOrWhiteSpace($Value) -or $Value -notmatch $Pattern) {
        throw "Unsafe or incomplete handoff value: $Name"
    }
}

function Restore-ProcessEnvironment {
    param(
        [Parameter(Mandatory)]
        [hashtable]$PreviousValues
    )

    foreach ($name in $PreviousValues.Keys) {
        [Environment]::SetEnvironmentVariable(
            $name,
            $PreviousValues[$name],
            [EnvironmentVariableTarget]::Process
        )
    }
}

$previousAwsProfile = [Environment]::GetEnvironmentVariable('AWS_PROFILE', [EnvironmentVariableTarget]::Process)
$previousAwsRegion = [Environment]::GetEnvironmentVariable('AWS_REGION', [EnvironmentVariableTarget]::Process)
$previousRuntimeValues = @{}

try {
    [Environment]::SetEnvironmentVariable('AWS_PROFILE', $AwsProfile, [EnvironmentVariableTarget]::Process)
    [Environment]::SetEnvironmentVariable('AWS_REGION', $AwsRegion, [EnvironmentVariableTarget]::Process)

    $identityJson = & aws sts get-caller-identity --profile $AwsProfile --region $AwsRegion --output json
    if ($LASTEXITCODE -ne 0) {
        throw 'AWS caller lookup failed.'
    }
    $identity = ($identityJson -join "`n" | ConvertFrom-Json)
    if (
        [string]$identity.Account -ne $ExpectedAccount -or
        [string]$identity.Arn -ne $ExpectedArn
    ) {
        throw 'unexpected AWS caller'
    }

    foreach ($module in @($EdgeRoot, $IdentityRoot, $ApiRoot)) {
        if (-not (Test-Path -LiteralPath $module)) {
            throw "Required Terraform module is missing: $module"
        }
    }

    if (-not $Apply) {
        Write-Output "Preflight passed for $AwsProfile in $AwsRegion. No build or AWS mutation was performed."
        return
    }

    $handoff = @{}
    foreach ($name in $RequiredOutputNames) {
        $moduleRoot = if ($name -like 'frontend_*' -or $name -like '*cloudfront*') {
            $EdgeRoot
        } elseif ($name -like 'cognito_*') {
            $IdentityRoot
        } else {
            $ApiRoot
        }
        $handoff[$name] = Get-TerraformOutput -ModuleRoot $moduleRoot -Name $name
    }

    Assert-HandoffValue 'frontend_bucket_name' $handoff.frontend_bucket_name '^la-[a-z0-9-]{3,62}$'
    Assert-HandoffValue 'cloudfront_distribution_id' $handoff.cloudfront_distribution_id '^[A-Z0-9]{8,32}$'
    Assert-HandoffValue 'cognito_user_pool_id' $handoff.cognito_user_pool_id '^[A-Za-z0-9_-]+$'
    Assert-HandoffValue 'cognito_client_id' $handoff.cognito_client_id '^[A-Za-z0-9]+$'
    Assert-HandoffValue 'stage3_rest_invoke_url' $handoff.stage3_rest_invoke_url '^https://[A-Za-z0-9.-]+(?:/[^\s]*)?$'
    Assert-HandoffValue 'websocket_url' $handoff.websocket_url '^wss://[A-Za-z0-9.-]+(?:/[^\s]*)?$'
    Assert-HandoffValue 'stage3_rest_api_key_id' $handoff.stage3_rest_api_key_id '^[A-Za-z0-9]+$'
    Assert-HandoffValue 'media_cloudfront_origin' $handoff.media_cloudfront_origin '^https://[A-Za-z0-9.-]+$'
    Assert-HandoffValue 'media_cloudfront_distribution_id' $handoff.media_cloudfront_distribution_id '^[A-Z0-9]{8,32}$'

    $apiKeyResponse = Invoke-AwsJson -Arguments @(
        'apigateway',
        'get-api-key',
        '--api-key',
        $handoff.stage3_rest_api_key_id,
        '--include-value'
    )
    $apiKeyValue = [string]$apiKeyResponse.value
    Assert-HandoffValue 'stage3_rest_api_key' $apiKeyValue '^[\x21-\x7e]+$'

    $runtimeValues = @{
        VITE_AWS_REGION = $AwsRegion
        VITE_COGNITO_USER_POOL_ID = $handoff.cognito_user_pool_id
        VITE_COGNITO_CLIENT_ID = $handoff.cognito_client_id
        VITE_REST_API_URL = $handoff.stage3_rest_invoke_url
        VITE_REST_API_KEY = $apiKeyValue
        VITE_WS_URL = $handoff.websocket_url
        VITE_MEDIA_BASE_URL = $handoff.media_cloudfront_origin
    }
    foreach ($name in $RuntimeNames) {
        $previousRuntimeValues[$name] = [Environment]::GetEnvironmentVariable($name, [EnvironmentVariableTarget]::Process)
        [Environment]::SetEnvironmentVariable($name, $runtimeValues[$name], [EnvironmentVariableTarget]::Process)
    }

    Push-Location $FrontendRoot
    try {
        & npm run build
        if ($LASTEXITCODE -ne 0) {
            throw 'Frontend build failed.'
        }
    } finally {
        Pop-Location
    }

    $distRoot = Join-Path $FrontendRoot 'dist'
    if (-not (Test-Path -LiteralPath (Join-Path $distRoot 'index.html'))) {
        throw 'Frontend build output is missing index.html.'
    }

    & aws s3 sync $distRoot "s3://$($handoff.frontend_bucket_name)" --delete --only-show-errors --profile $AwsProfile --region $AwsRegion
    if ($LASTEXITCODE -ne 0) {
        throw 'S3 upload failed.'
    }

    $javaScriptAssets = @(Get-ChildItem -LiteralPath $distRoot -Recurse -File -Filter '*.js')
    if ($javaScriptAssets.Count -eq 0) {
        throw 'Frontend build output has no JavaScript assets.'
    }
    & aws s3 cp $distRoot "s3://$($handoff.frontend_bucket_name)" --recursive --exclude '*' --include '*.js' --content-type text/javascript --metadata-directive REPLACE --only-show-errors --profile $AwsProfile --region $AwsRegion
    if ($LASTEXITCODE -ne 0) {
        throw 'JavaScript asset metadata update failed.'
    }

    & aws cloudfront create-invalidation --distribution-id $handoff.cloudfront_distribution_id --paths '/*' --profile $AwsProfile --region $AwsRegion --output json | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw 'CloudFront invalidation failed.'
    }
    Write-Output 'Frontend deployment completed.'
} finally {
    Restore-ProcessEnvironment -PreviousValues $previousRuntimeValues
    [Environment]::SetEnvironmentVariable('AWS_PROFILE', $previousAwsProfile, [EnvironmentVariableTarget]::Process)
    [Environment]::SetEnvironmentVariable('AWS_REGION', $previousAwsRegion, [EnvironmentVariableTarget]::Process)
}
