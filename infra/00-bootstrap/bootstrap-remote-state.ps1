[CmdletBinding()]
param(
    [string]$Region = 'ap-southeast-1',
    [string]$Profile,
    [string]$BucketPrefix = 'la-tfstate',
    [string]$LockTableName = 'la-tflock'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-AwsCliAvailable {
    if (-not (Get-Command -Name 'aws' -ErrorAction SilentlyContinue)) {
        throw 'AWS CLI v2 was not found in PATH. Install it or open a new terminal, then run the script again.'
    }
}

function Invoke-AwsCli {
    param(
        [Parameter(Mandatory)]
        [string[]]$Arguments,

        [switch]$AllowFailure
    )

    $globalArguments = @('--no-cli-pager')
    if ($Profile) {
        $globalArguments += @('--profile', $Profile)
    }

    # Native stderr is expected for not-found probes; capture it without letting
    # PowerShell's global error preference terminate the process boundary.
    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $result = & aws @globalArguments @Arguments 2>&1
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    $output = ($result | ForEach-Object { $_.ToString() }) -join [Environment]::NewLine

    if ($exitCode -ne 0 -and -not $AllowFailure) {
        throw "AWS CLI failed (exit $exitCode): $output"
    }

    [pscustomobject]@{
        ExitCode = $exitCode
        Output   = $output
    }
}

function Get-AwsIdentity {
    $response = Invoke-AwsCli -Arguments @(
        'sts',
        'get-caller-identity',
        '--output', 'json'
    )

    $response.Output | ConvertFrom-Json
}

function Ensure-StateBucket {
    param(
        [Parameter(Mandatory)]
        [string]$BucketName,

        [Parameter(Mandatory)]
        [string]$Region
    )

    $lookup = Invoke-AwsCli -Arguments @(
        's3api', 'head-bucket',
        '--bucket', $BucketName
    ) -AllowFailure

    if (
        $lookup.ExitCode -ne 0 -and
        $lookup.Output -notmatch '(?i)(404|Not Found|NoSuchBucket)'
    ) {
        throw "Unable to check S3 bucket '$BucketName': $($lookup.Output)"
    }

    if ($lookup.ExitCode -ne 0) {
        $createArguments = @(
            's3api', 'create-bucket',
            '--bucket', $BucketName,
            '--region', $Region
        )
        if ($Region -ne 'us-east-1') {
            $createArguments += @(
                '--create-bucket-configuration',
                "LocationConstraint=$Region"
            )
        }

        Invoke-AwsCli -Arguments $createArguments | Out-Null
    }

    Invoke-AwsCli -Arguments @(
        's3api', 'put-bucket-versioning',
        '--bucket', $BucketName,
        '--versioning-configuration', 'Status=Enabled',
        '--region', $Region
    ) | Out-Null

    $encryption = @{
        Rules = @(
            @{
                ApplyServerSideEncryptionByDefault = @{
                    SSEAlgorithm = 'AES256'
                }
            }
        )
    } | ConvertTo-Json -Depth 4 -Compress

    $encryptionPath = Join-Path `
        ([System.IO.Path]::GetTempPath()) `
        "la-s3-encryption-$([guid]::NewGuid().ToString('N')).json"
    try {
        [System.IO.File]::WriteAllText(
            $encryptionPath,
            $encryption,
            [System.Text.UTF8Encoding]::new($false)
        )

        Invoke-AwsCli -Arguments @(
            's3api', 'put-bucket-encryption',
            '--bucket', $BucketName,
            '--server-side-encryption-configuration', "file://$encryptionPath",
            '--region', $Region
        ) | Out-Null
    }
    finally {
        Remove-Item -LiteralPath $encryptionPath -Force -ErrorAction SilentlyContinue
    }

    Invoke-AwsCli -Arguments @(
        's3api', 'put-public-access-block',
        '--bucket', $BucketName,
        '--public-access-block-configuration',
        'BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true',
        '--region', $Region
    ) | Out-Null
}

function Ensure-LockTable {
    param(
        [Parameter(Mandatory)]
        [string]$TableName,

        [Parameter(Mandatory)]
        [string]$Region
    )

    $lookup = Invoke-AwsCli -Arguments @(
        'dynamodb', 'describe-table',
        '--table-name', $TableName,
        '--region', $Region,
        '--output', 'json'
    ) -AllowFailure

    if ($lookup.ExitCode -eq 0) {
        return
    }

    if ($lookup.Output -notmatch 'ResourceNotFoundException') {
        throw "Unable to check DynamoDB table '$TableName': $($lookup.Output)"
    }

    Invoke-AwsCli -Arguments @(
        'dynamodb', 'create-table',
        '--table-name', $TableName,
        '--attribute-definitions', 'AttributeName=LockID,AttributeType=S',
        '--key-schema', 'AttributeName=LockID,KeyType=HASH',
        '--billing-mode', 'PAY_PER_REQUEST',
        '--region', $Region
    ) | Out-Null

    Invoke-AwsCli -Arguments @(
        'dynamodb', 'wait', 'table-exists',
        '--table-name', $TableName,
        '--region', $Region
    ) | Out-Null
}

function Invoke-RemoteStateBootstrap {
    param(
        [Parameter(Mandatory)]
        [string]$Region,

        [Parameter(Mandatory)]
        [string]$BucketPrefix,

        [Parameter(Mandatory)]
        [string]$LockTableName
    )

    Assert-AwsCliAvailable
    $identity = Get-AwsIdentity
    $bucketName = "$BucketPrefix-$($identity.Account)"

    if ($identity.Arn -match ':root$') {
        Write-Warning 'Authenticated as the AWS account root. Use an IAM admin role or IAM Identity Center for routine Terraform work.'
    }

    Write-Host "AWS caller: $($identity.Arn)"
    Write-Host "Ensuring S3 state bucket: $bucketName"
    Ensure-StateBucket -BucketName $bucketName -Region $Region

    Write-Host "Ensuring DynamoDB lock table: $LockTableName"
    Ensure-LockTable -TableName $LockTableName -Region $Region

    Write-Host ''
    Write-Host 'Terraform backend values:'
    Write-Host "  bucket         = `"$bucketName`""
    Write-Host '  key            = "<module>/terraform.tfstate"'
    Write-Host "  region         = `"$Region`""
    Write-Host "  dynamodb_table = `"$LockTableName`""
    Write-Host '  encrypt        = true'
}

if ($MyInvocation.InvocationName -ne '.') {
    Invoke-RemoteStateBootstrap `
        -Region $Region `
        -BucketPrefix $BucketPrefix `
        -LockTableName $LockTableName
}
