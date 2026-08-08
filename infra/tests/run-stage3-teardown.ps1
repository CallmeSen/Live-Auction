[CmdletBinding()]
param(
    [string]$Profile = 'la-admin',
    [string]$Region = 'ap-southeast-1',
    [switch]$Apply
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$ProgressPreference = 'SilentlyContinue'

$expectedAccount = '233376973052'
$expectedArn = 'arn:aws:iam::233376973052:user/la-admin'
$expectedApiGatewayRole = `
    'arn:aws:iam::233376973052:role/la-api-gateway-cloudwatch'
$expectedBidderIndex = 'bidder_sub-sk-index'
$script:CallerGatePassed = $false
$script:TerraformCredentials = $null
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

function Assert-CallerGatePassed {
    if (-not $script:CallerGatePassed) {
        throw 'Caller gate has not passed'
    }
}

function Invoke-AwsCli {
    param(
        [Parameter(Mandatory)][string[]]$Arguments,
        [switch]$AllowCallerProbe
    )

    $isCallerProbe = (
        $Arguments.Count -eq 2 -and
        $Arguments[0] -eq 'sts' -and
        $Arguments[1] -eq 'get-caller-identity'
    )
    if (-not $script:CallerGatePassed -and
        -not ($AllowCallerProbe -and $isCallerProbe)) {
        throw 'AWS access before caller gate is forbidden'
    }

    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $raw = & aws --profile $Profile --region $Region --no-cli-pager `
        @Arguments --output json 2>&1
    $exitCode = $LASTEXITCODE
    $ErrorActionPreference = $previousPreference
    if ($exitCode -ne 0) {
        $operation = ($Arguments | Select-Object -First 2) -join ' '
        throw "AWS CLI operation failed: $operation (exit $exitCode)"
    }
    return @($raw)
}

function Invoke-AwsJson {
    param(
        [Parameter(Mandatory)][string[]]$Arguments,
        [switch]$AllowCallerProbe
    )

    $raw = @(
        Invoke-AwsCli -Arguments $Arguments `
            -AllowCallerProbe:$AllowCallerProbe
    )
    if ($raw.Count -eq 0 -or [string]::IsNullOrWhiteSpace(($raw -join ''))) {
        return $null
    }
    return (($raw -join "`n") | ConvertFrom-Json)
}

function Get-OptionalProperty {
    param(
        $Value,
        [Parameter(Mandatory)][string]$Name
    )

    if ($null -eq $Value) {
        return $null
    }
    $property = $Value.PSObject.Properties[$Name]
    if ($null -eq $property) {
        return $null
    }
    return $property.Value
}

function Get-OptionalCollection {
    param(
        $Value,
        [Parameter(Mandatory)][string]$Name
    )

    $items = New-Object System.Collections.Generic.List[object]
    if ($null -eq $Value) {
        return $items.ToArray()
    }
    $property = $Value.PSObject.Properties[$Name]
    if ($null -eq $property -or $null -eq $property.Value) {
        return $items.ToArray()
    }
    foreach ($item in @($property.Value)) {
        if ($null -ne $item) {
            $items.Add($item)
        }
    }
    return $items.ToArray()
}

function Assert-ExactCaller {
    param([switch]$AllowCallerProbe)

    $caller = Invoke-AwsJson -Arguments @('sts', 'get-caller-identity') `
        -AllowCallerProbe:$AllowCallerProbe
    if ([string]$caller.Account -ne $expectedAccount -or
        [string]$caller.Arn -match ':root$' -or
        [string]$caller.Arn -ne $expectedArn) {
        throw 'Caller gate failed: exact la-admin IAM user is required'
    }
    return $caller
}

function Get-Stage3UserPoolId {
    $matches = New-Object System.Collections.Generic.List[string]
    $nextToken = $null
    do {
        $arguments = @('cognito-idp', 'list-user-pools', '--max-results', '60')
        if (-not [string]::IsNullOrWhiteSpace($nextToken)) {
            $arguments += @('--next-token', $nextToken)
        }
        $response = Invoke-AwsJson -Arguments $arguments
        foreach ($pool in @(Get-OptionalCollection $response 'UserPools')) {
            if ([string]$pool.Name -eq 'la-users') {
                $matches.Add([string]$pool.Id)
            }
        }
        $nextToken = [string](Get-OptionalProperty $response 'NextToken')
    } while (-not [string]::IsNullOrWhiteSpace($nextToken))

    if ($matches.Count -ne 1) {
        throw 'Expected exactly one Stage 2 Cognito user pool'
    }
    return $matches[0]
}

function Assert-NoFixtureUsers {
    $poolId = Get-Stage3UserPoolId
    $paginationToken = $null
    do {
        $arguments = @(
            'cognito-idp', 'list-users',
            '--user-pool-id', $poolId,
            '--limit', '60'
        )
        if (-not [string]::IsNullOrWhiteSpace($paginationToken)) {
            $arguments += @('--pagination-token', $paginationToken)
        }
        $response = Invoke-AwsJson -Arguments $arguments
        foreach ($user in @(Get-OptionalCollection $response 'Users')) {
            if ([string]$user.Username -like 'stage3-*') {
                throw 'Stage 3 Cognito fixture users remain'
            }
        }
        $paginationToken = [string](
            Get-OptionalProperty $response 'PaginationToken'
        )
    } while (-not [string]::IsNullOrWhiteSpace($paginationToken))
}

function Assert-NoOneTimeSchedules {
    $nextToken = $null
    do {
        $arguments = @(
            'scheduler', 'list-schedules',
            '--group-name', 'la-scheduler',
            '--max-results', '100'
        )
        if (-not [string]::IsNullOrWhiteSpace($nextToken)) {
            $arguments += @('--next-token', $nextToken)
        }
        $response = Invoke-AwsJson -Arguments $arguments
        foreach ($schedule in @(Get-OptionalCollection $response 'Schedules')) {
            if ([string]$schedule.Name -ne 'la-lifecycle-watchdog') {
                throw 'Stage 3 one-time schedules remain'
            }
        }
        $nextToken = [string](Get-OptionalProperty $response 'NextToken')
    } while (-not [string]::IsNullOrWhiteSpace($nextToken))
}

function Assert-NoDynamoFixtures {
    foreach ($tableName in @(
        'la_auction_catalog',
        'la_item_auction_state',
        'la_bid_events',
        'la_item_bidder_aliases',
        'la_websocket_connections'
    )) {
        $response = Invoke-AwsJson -Arguments @(
            'dynamodb', 'scan',
            '--table-name', $tableName,
            '--consistent-read',
            '--select', 'COUNT'
        )
        if ([long]$response.Count -ne 0) {
            throw 'DynamoDB fixture data remains'
        }
    }
}

function Assert-BidderIndexExists {
    $response = Invoke-AwsJson -Arguments @(
        'dynamodb', 'describe-table', '--table-name', 'la_bid_events'
    )
    $indexes = @(Get-OptionalCollection $response.Table `
        'GlobalSecondaryIndexes')
    $matches = @($indexes | Where-Object {
        [string]$_.IndexName -eq $expectedBidderIndex
    })
    if ($matches.Count -ne 1 -or
        [string]$matches[0].IndexStatus -ne 'ACTIVE') {
        throw 'Expected active Stage 3 bidder index is not ready'
    }
}

function Assert-NoMediaVersions {
    $keyMarker = $null
    $versionMarker = $null
    do {
        $arguments = @(
            's3api', 'list-object-versions',
            '--bucket', 'la-item-media-233376973052-ap-southeast-1'
        )
        if (-not [string]::IsNullOrWhiteSpace($keyMarker)) {
            $arguments += @('--key-marker', $keyMarker)
        }
        if (-not [string]::IsNullOrWhiteSpace($versionMarker)) {
            $arguments += @('--version-id-marker', $versionMarker)
        }
        $response = Invoke-AwsJson -Arguments $arguments
        if (@(Get-OptionalCollection $response 'Versions').Count -ne 0 -or
            @(Get-OptionalCollection $response 'DeleteMarkers').Count -ne 0) {
            throw 'Versioned media fixtures remain'
        }
        $keyMarker = [string](Get-OptionalProperty $response 'NextKeyMarker')
        $versionMarker = [string](
            Get-OptionalProperty $response 'NextVersionIdMarker'
        )
        $isTruncated = (Get-OptionalProperty $response 'IsTruncated') -eq $true
    } while ($isTruncated)
}

function Assert-QueuesEmpty {
    foreach ($queueName in @(
        'la-bid-commands.fifo',
        'la-bid-commands-dlq.fifo',
        'la-scheduler-dlq'
    )) {
        $queue = Invoke-AwsJson -Arguments @(
            'sqs', 'get-queue-url', '--queue-name', $queueName
        )
        $attributes = Invoke-AwsJson -Arguments @(
            'sqs', 'get-queue-attributes',
            '--queue-url', [string]$queue.QueueUrl,
            '--attribute-names',
            'ApproximateNumberOfMessages',
            'ApproximateNumberOfMessagesNotVisible',
            'ApproximateNumberOfMessagesDelayed'
        )
        $total = [long]$attributes.Attributes.ApproximateNumberOfMessages +
            [long]$attributes.Attributes.ApproximateNumberOfMessagesNotVisible +
            [long]$attributes.Attributes.ApproximateNumberOfMessagesDelayed
        if ($total -ne 0) {
            throw 'Stage 3 queue or DLQ is not empty'
        }
    }
}

function Test-StageUsesRegionalLoggingRole {
    param([Parameter(Mandatory)]$Stage)

    if ($null -ne (Get-OptionalProperty $Stage 'accessLogSettings')) {
        return $true
    }
    $methodSettings = Get-OptionalProperty $Stage 'methodSettings'
    if ($null -eq $methodSettings) {
        return $false
    }
    foreach ($property in @($methodSettings.PSObject.Properties)) {
        $settings = $property.Value
        $loggingLevel = [string](Get-OptionalProperty $settings 'loggingLevel')
        $dataTraceEnabled = (
            Get-OptionalProperty $settings 'dataTraceEnabled'
        ) -eq $true
        $metricsEnabled = (
            Get-OptionalProperty $settings 'metricsEnabled'
        ) -eq $true
        if ((-not [string]::IsNullOrWhiteSpace($loggingLevel) -and
                $loggingLevel -ne 'OFF') -or
            $dataTraceEnabled -or $metricsEnabled) {
            return $true
        }
    }
    return $false
}

function Assert-ApiGatewayLoggingOwnership {
    $account = Invoke-AwsJson -Arguments @('apigateway', 'get-account')
    if ([string]$account.cloudwatchRoleArn -ne $expectedApiGatewayRole) {
        throw 'API Gateway account logging role ownership differs'
    }

    $apis = New-Object System.Collections.Generic.List[object]
    $position = $null
    do {
        $arguments = @('apigateway', 'get-rest-apis', '--limit', '500')
        if (-not [string]::IsNullOrWhiteSpace($position)) {
            $arguments += @('--position', $position)
        }
        $response = Invoke-AwsJson -Arguments $arguments
        foreach ($api in @(Get-OptionalCollection $response 'items')) {
            $apis.Add($api)
        }
        $position = [string](Get-OptionalProperty $response 'position')
    } while (-not [string]::IsNullOrWhiteSpace($position))

    $stage3Apis = @($apis.ToArray() | Where-Object {
        [string]$_.name -eq 'la-control-plane'
    })
    if ($stage3Apis.Count -ne 1) {
        throw 'Expected exactly one Stage 3 REST API'
    }
    foreach ($api in $apis.ToArray()) {
        if ([string]$api.id -eq [string]$stage3Apis[0].id) {
            continue
        }
        $stages = Invoke-AwsJson -Arguments @(
            'apigateway', 'get-stages', '--rest-api-id', [string]$api.id
        )
        foreach ($stage in @(Get-OptionalCollection $stages 'item')) {
            if (Test-StageUsesRegionalLoggingRole -Stage $stage) {
                throw 'A non-Stage 3 REST stage depends on the regional logging role'
            }
        }
    }
}

function Assert-TeardownPreflight {
    Assert-CallerGatePassed
    Assert-NoFixtureUsers
    Assert-NoOneTimeSchedules
    Assert-NoDynamoFixtures
    Assert-BidderIndexExists
    Assert-NoMediaVersions
    Assert-QueuesEmpty
    Assert-ApiGatewayLoggingOwnership
}

function Initialize-TerraformCredentials {
    Assert-CallerGatePassed
    $credentials = Invoke-AwsJson -Arguments @(
        'configure', 'export-credentials', '--format', 'process'
    )
    if ([int]$credentials.Version -ne 1 -or
        [string]::IsNullOrWhiteSpace([string]$credentials.AccessKeyId) -or
        [string]::IsNullOrWhiteSpace([string]$credentials.SecretAccessKey) -or
        [string]::IsNullOrWhiteSpace([string]$credentials.SessionToken)) {
        throw 'AWS login session export is incomplete'
    }
    $script:TerraformCredentials = $credentials
}

function Invoke-Terraform {
    param(
        [Parameter(Mandatory)][string]$Module,
        [Parameter(Mandatory)][string[]]$Arguments,
        [switch]$Capture
    )

    Assert-CallerGatePassed
    if ($null -eq $script:TerraformCredentials) {
        throw 'Terraform credentials have not been initialized'
    }
    $modulePath = Join-Path $repoRoot $Module
    $temporaryEnvironment = @{
        AWS_ACCESS_KEY_ID     = [string]$script:TerraformCredentials.AccessKeyId
        AWS_SECRET_ACCESS_KEY = [string]$script:TerraformCredentials.SecretAccessKey
        AWS_SESSION_TOKEN     = [string]$script:TerraformCredentials.SessionToken
        AWS_REGION            = $Region
        AWS_DEFAULT_REGION    = $Region
    }
    $previousEnvironment = @{}
    foreach ($entry in $temporaryEnvironment.GetEnumerator()) {
        $previousEnvironment[$entry.Key] = [Environment]::GetEnvironmentVariable(
            $entry.Key,
            [EnvironmentVariableTarget]::Process
        )
        [Environment]::SetEnvironmentVariable(
            $entry.Key,
            $entry.Value,
            [EnvironmentVariableTarget]::Process
        )
    }
    try {
        $previousPreference = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        $raw = & terraform "-chdir=$modulePath" @Arguments 2>&1
        $exitCode = $LASTEXITCODE
        $ErrorActionPreference = $previousPreference
    }
    finally {
        foreach ($entry in $temporaryEnvironment.GetEnumerator()) {
            [Environment]::SetEnvironmentVariable(
                $entry.Key,
                $previousEnvironment[$entry.Key],
                [EnvironmentVariableTarget]::Process
            )
        }
    }
    if ($exitCode -ne 0) {
        throw "Terraform operation failed for $Module"
    }
    if ($Capture) {
        return ($raw -join "`n")
    }
}

function Assert-BidderIndexManagedSeparately {
    $address = 'aws_dynamodb_global_secondary_index.bid_events_by_bidder[0]'
    $managed = Invoke-Terraform -Module 'infra/04-data' `
        -Arguments @('state', 'list', $address) -Capture
    if ([string]$managed -ne $address) {
        throw 'Stage 3 bidder index must be migrated to its dedicated state resource'
    }
}

function Assert-ExactAddressSet {
    param(
        [Parameter(Mandatory)][string[]]$Actual,
        [Parameter(Mandatory)][string[]]$Expected,
        [Parameter(Mandatory)][string]$Module
    )

    $actualSorted = @($Actual | Sort-Object)
    $expectedSorted = @($Expected | Sort-Object)
    if (($actualSorted -join '|') -ne ($expectedSorted -join '|')) {
        throw "Unexpected managed resources in disable plan for $Module"
    }
}

function Review-DisablePlan {
    param(
        [Parameter(Mandatory)]$Module,
        [Parameter(Mandatory)]$Plan
    )

    $managed = @($Plan.resource_changes | Where-Object { $_.mode -eq 'managed' })
    $changed = @($managed | Where-Object {
        ($_.change.actions -join ',') -ne 'no-op'
    })
    foreach ($change in $changed) {
        if (($change.change.actions -join ',') -in @(
            'delete,create',
            'create,delete'
        )) {
            throw "Unexpected replacement in disable plan for $($Module.Path)"
        }
    }
    $actualAddresses = @($changed | ForEach-Object { [string]$_.address })
    Assert-ExactAddressSet -Actual $actualAddresses `
        -Expected $Module.ExpectedChanges -Module $Module.Path

    foreach ($change in $changed) {
        if (($change.change.actions -join ',') -ne 'delete') {
            throw "Unexpected non-delete action in disable plan for $($Module.Path)"
        }
    }
    return [pscustomobject]@{
        Module = $Module.Path
        Changed = $changed.Count
        Deleted = @($changed | Where-Object {
            ($_.change.actions -join ',') -eq 'delete'
        }).Count
        Updated = @($changed | Where-Object {
            ($_.change.actions -join ',') -eq 'update'
        }).Count
    }
}

$modules = @(
    [pscustomobject]@{
        Path = 'infra/07-api'
        ExpectedChanges = @(
            'aws_api_gateway_account.stage3[0]'
            'aws_api_gateway_api_key.stage3[0]'
            'aws_api_gateway_deployment.stage3[0]'
            'aws_api_gateway_gateway_response.default_4xx[0]'
            'aws_api_gateway_gateway_response.default_5xx[0]'
            'aws_api_gateway_method_settings.cache["/api/v1/auction-items"]'
            'aws_api_gateway_method_settings.cache["/api/v1/auction-sessions"]'
            'aws_api_gateway_method_settings.default[0]'
            'aws_api_gateway_rest_api.stage3[0]'
            'aws_api_gateway_stage.stage3[0]'
            'aws_api_gateway_usage_plan.stage3[0]'
            'aws_api_gateway_usage_plan_key.stage3[0]'
            'aws_cloudwatch_log_group.stage3_access[0]'
            'aws_iam_role.api_gateway_cloudwatch[0]'
            'aws_iam_role_policy.api_gateway_cloudwatch[0]'
            'aws_lambda_permission.admin_command_rest[0]'
            'aws_lambda_permission.item_service_rest[0]'
            'aws_lambda_permission.query_service_rest[0]'
            'aws_lambda_permission.session_service_rest[0]'
        )
    }
    [pscustomobject]@{
        Path = 'infra/06-compute/stage3-control-plane'
        ExpectedChanges = @(
            'aws_cloudwatch_log_group.admin_command[0]'
            'aws_cloudwatch_log_group.item_service[0]'
            'aws_cloudwatch_log_group.query_service[0]'
            'aws_cloudwatch_log_group.session_service[0]'
            'aws_iam_role.admin_command[0]'
            'aws_iam_role.item_service[0]'
            'aws_iam_role.query_service[0]'
            'aws_iam_role.session_service[0]'
            'aws_iam_role_policy.admin_command[0]'
            'aws_iam_role_policy.item_service[0]'
            'aws_iam_role_policy.query_service[0]'
            'aws_iam_role_policy.session_service[0]'
            'aws_lambda_function.admin_command[0]'
            'aws_lambda_function.item_service[0]'
            'aws_lambda_function.query_service[0]'
            'aws_lambda_function.session_service[0]'
            'aws_lambda_layer_version.stage3_common[0]'
            'aws_lambda_permission.admin_scheduler[0]'
            'aws_scheduler_schedule.lifecycle_watchdog[0]'
        )
    }
    [pscustomobject]@{
        Path = 'infra/05-messaging'
        ExpectedChanges = @(
            'aws_iam_role.scheduler_invoke[0]'
            'aws_iam_role_policy.scheduler_invoke[0]'
            'aws_scheduler_schedule_group.main[0]'
            'aws_sqs_queue.scheduler_dlq[0]'
        )
    }
    [pscustomobject]@{
        Path = 'infra/04-data'
        ExpectedChanges = @(
            'aws_dynamodb_global_secondary_index.bid_events_by_bidder[0]'
            'aws_dynamodb_table.auction_catalog[0]'
            'aws_s3_bucket.media[0]'
            'aws_s3_bucket_cors_configuration.media[0]'
            'aws_s3_bucket_lifecycle_configuration.media[0]'
            'aws_s3_bucket_ownership_controls.media[0]'
            'aws_s3_bucket_public_access_block.media[0]'
            'aws_s3_bucket_server_side_encryption_configuration.media[0]'
            'aws_s3_bucket_versioning.media[0]'
        )
    }
)

if ($Profile -ne 'la-admin' -or $Region -ne 'ap-southeast-1') {
    throw 'Teardown is pinned to profile la-admin and region ap-southeast-1'
}
$caller = Assert-ExactCaller -AllowCallerProbe
$script:CallerGatePassed = $true
Assert-TeardownPreflight
Initialize-TerraformCredentials
Assert-BidderIndexManagedSeparately

$reviewedPlans = New-Object System.Collections.Generic.List[object]
try {
    foreach ($module in $modules) {
        Invoke-Terraform -Module $module.Path -Arguments @(
            'plan',
            '-input=false',
            '-var=enable_stage3=false',
            '-out=stage3-disable.tfplan'
        )
        $plan = Invoke-Terraform -Module $module.Path `
            -Arguments @('show', '-json', 'stage3-disable.tfplan') -Capture |
            ConvertFrom-Json
        $review = Review-DisablePlan -Module $module -Plan $plan
        $planPath = Join-Path (Join-Path $repoRoot $module.Path) `
            'stage3-disable.tfplan'
        $reviewedPlans.Add([pscustomobject]@{
            Module = $module.Path
            Path = $planPath
            SHA256 = (Get-FileHash $planPath -Algorithm SHA256).Hash
            Review = $review
        })
        Write-Output "disable plan reviewed: $($module.Path)"
    }

    if (-not $Apply) {
        Write-Output 'disable plans: reviewed only'
        return
    }

    Assert-TeardownPreflight
    foreach ($reviewedPlan in $reviewedPlans.ToArray()) {
        Assert-ExactCaller | Out-Null
        $actualHash = (Get-FileHash $reviewedPlan.Path -Algorithm SHA256).Hash
        if ($actualHash -ne $reviewedPlan.SHA256) {
            throw "Reviewed disable plan hash changed for $($reviewedPlan.Module)"
        }
        Invoke-Terraform -Module $reviewedPlan.Module -Arguments @(
            'apply',
            '-input=false',
            '-auto-approve',
            'stage3-disable.tfplan'
        )
        Write-Output "disable plan applied: $($reviewedPlan.Module)"
    }
}
finally {
    $caller = $null
    $script:TerraformCredentials = $null
}

Write-Output 'targeted Stage 3 teardown: applied'
