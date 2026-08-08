[CmdletBinding()]
param(
    [int]$TimeoutSeconds = 90
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$env:AWS_PROFILE = "la"
$env:AWS_REGION = "ap-southeast-1"

function Invoke-AwsJson {
    param([string[]]$Arguments)

    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $raw = & aws @Arguments 2>&1
    $exitCode = $LASTEXITCODE
    $ErrorActionPreference = $previousPreference
    if ($exitCode -ne 0) {
        throw "AWS CLI failed ($exitCode): $($raw -join "`n")"
    }
    if (-not $raw) {
        return $null
    }
    return (($raw -join "`n") | ConvertFrom-Json)
}

function Invoke-AwsJsonPayload {
    param(
        [string[]]$Arguments,
        [hashtable]$Payload
    )

    $tempPath = Join-Path ([System.IO.Path]::GetTempPath()) `
        ("live-auction-integration-" + [Guid]::NewGuid().ToString("N") + ".json")
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    $json = $Payload | ConvertTo-Json -Compress -Depth 10
    [System.IO.File]::WriteAllText($tempPath, $json, $utf8NoBom)
    try {
        return Invoke-AwsJson ($Arguments + @("--cli-input-json", "file://$tempPath", "--output", "json"))
    }
    finally {
        Remove-Item -LiteralPath $tempPath -Force -ErrorAction SilentlyContinue
    }
}

function Get-TerraformOutput([string]$Module, [string]$Name) {
    $modulePath = Join-Path $repoRoot $Module
    $raw = & terraform "-chdir=$modulePath" output -raw $Name 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Terraform output failed for $Module/$Name`: $($raw -join "`n")"
    }
    return ($raw -join "`n").Trim()
}

function Wait-Until {
    param(
        [scriptblock]$Condition,
        [string]$Description,
        [int]$Timeout = $TimeoutSeconds
    )

    $deadline = [DateTimeOffset]::UtcNow.AddSeconds($Timeout)
    do {
        $value = & $Condition
        if ($value) {
            return $value
        }
        Start-Sleep -Seconds 2
    } while ([DateTimeOffset]::UtcNow -lt $deadline)

    throw "Timed out waiting for $Description"
}

function Get-State {
    param([string]$TableName, [string]$ItemId)

    return Invoke-AwsJsonPayload @("dynamodb", "get-item", "--consistent-read") @{
        TableName = $TableName
        Key       = @{ item_id = @{ S = $ItemId } }
    }
}

function Get-Events {
    param([string]$TableName, [string]$ItemId)

    return Invoke-AwsJsonPayload @("dynamodb", "query") @{
        TableName                 = $TableName
        KeyConditionExpression    = "item_id = :item"
        ExpressionAttributeValues = @{ ":item" = @{ S = $ItemId } }
    }
}

function Send-Bid {
    param(
        [string]$QueueUrl,
        [string]$ItemId,
        [string]$RequestId,
        [string]$Amount,
        [string]$UserSub,
        [string]$DeduplicationId
    )

    $body = @{
        item_id      = $ItemId
        amount       = $Amount
        request_id   = $RequestId
        user_sub     = $UserSub
        owner_region = $env:AWS_REGION
    } | ConvertTo-Json -Compress

    return Invoke-AwsJsonPayload @("sqs", "send-message") @{
        QueueUrl                = $QueueUrl
        MessageBody             = $body
        MessageGroupId          = $ItemId
        MessageDeduplicationId  = $DeduplicationId
    }
}

function Get-QueueCount([string]$QueueUrl) {
    $attributes = Invoke-AwsJson @(
        "sqs", "get-queue-attributes", "--queue-url", $QueueUrl,
        "--attribute-names", "ApproximateNumberOfMessages", "ApproximateNumberOfMessagesNotVisible",
        "--output", "json"
    )
    return [int]$attributes.Attributes.ApproximateNumberOfMessages +
        [int]$attributes.Attributes.ApproximateNumberOfMessagesNotVisible
}

$stateTable = Get-TerraformOutput "infra/04-data" "item_state_table_name"
$eventsTable = Get-TerraformOutput "infra/04-data" "bid_events_table_name"
$queueUrl = Get-TerraformOutput "infra/05-messaging" "bid_commands_queue_url"
$dlqUrl = Get-TerraformOutput "infra/05-messaging" "bid_commands_dlq_url"
$logGroup = Get-TerraformOutput "infra/06-compute" "bid_processor_log_group_name"

$runId = [DateTimeOffset]::UtcNow.ToString("yyyyMMddHHmmssfff")
$itemId = "integration-$runId"
$acceptedRequest = "req-$runId-accepted"
$lowRequest = "req-$runId-low"
$duplicateDedup = "dedup-$runId-duplicate"
$bidderSub = "integration-bidder-$runId"
$sellerSub = "integration-seller-$runId"
$endTime = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() + 600
$seeded = $false

try {
    $seedItem = [ordered]@{
        item_id         = @{ S = $itemId }
        current_price   = @{ N = "100" }
        status          = @{ S = "LIVE" }
        owner_region    = @{ S = $env:AWS_REGION }
        end_time        = @{ N = "$endTime" }
        version         = @{ N = "1" }
        seller_sub      = @{ S = $sellerSub }
        extension_count = @{ N = "0" }
    }

    Invoke-AwsJsonPayload @("dynamodb", "put-item") @{
        TableName = $stateTable
        Item      = $seedItem
    } | Out-Null
    $seeded = $true

    $seed = Get-State $stateTable $itemId
    if ($seed.Item.current_price.N -ne "100" -or $seed.Item.version.N -ne "1") {
        throw "Seed verification failed for $itemId"
    }

    $acceptedResponse = Send-Bid $queueUrl $itemId $acceptedRequest "150" $bidderSub $acceptedRequest
    if (-not $acceptedResponse.MessageId -or -not $acceptedResponse.SequenceNumber) {
        throw "Accepted bid was not acknowledged by SQS"
    }

    Wait-Until -Description "accepted state update" -Condition {
        $current = Get-State $stateTable $itemId
        $current.Item.current_price.N -eq "150" -and
        $current.Item.highest_bidder_id.S -eq $bidderSub -and
        $current.Item.version.N -eq "2"
    } | Out-Null

    Wait-Until -Description "accepted audit event" -Condition {
        $events = Get-Events $eventsTable $itemId
        @($events.Items | Where-Object {
            $_.request_id.S -eq $acceptedRequest -and $_.status.S -eq "ACCEPTED"
        }).Count -eq 1
    } | Out-Null

    $lowResponse = Send-Bid $queueUrl $itemId $lowRequest "120" $bidderSub $lowRequest
    if (-not $lowResponse.MessageId) {
        throw "Low bid was not acknowledged by SQS"
    }

    Wait-Until -Description "low bid rejected audit event" -Condition {
        $events = Get-Events $eventsTable $itemId
        @($events.Items | Where-Object {
            $_.request_id.S -eq $lowRequest -and
            $_.status.S -eq "REJECTED" -and
            $_.reason.S -eq "REJECTED_LOW_INCREMENT"
        }).Count -eq 1
    } | Out-Null

    $afterLow = Get-State $stateTable $itemId
    if ($afterLow.Item.current_price.N -ne "150" -or $afterLow.Item.version.N -ne "2") {
        throw "Low bid changed state unexpectedly"
    }

    $duplicateResponse = Send-Bid $queueUrl $itemId $acceptedRequest "150" $bidderSub $duplicateDedup
    if (-not $duplicateResponse.MessageId) {
        throw "Duplicate bid was not acknowledged by SQS"
    }

    Wait-Until -Description "duplicate message processing" -Condition {
        (Get-QueueCount $queueUrl) -eq 0
    } | Out-Null

    $afterDuplicate = Get-State $stateTable $itemId
    $eventCount = @((Get-Events $eventsTable $itemId).Items).Count
    if ($afterDuplicate.Item.current_price.N -ne "150" -or
        $afterDuplicate.Item.version.N -ne "2" -or
        $eventCount -ne 2) {
        throw "Duplicate bid changed state or created an audit event"
    }

    $dlqCount = Get-QueueCount $dlqUrl
    $logs = Invoke-AwsJson @(
        "logs", "filter-log-events", "--log-group-name", $logGroup,
        "--filter-pattern", "?AcceptedBid ?RejectedBid",
        "--output", "json"
    )

    [pscustomobject]@{
        ItemId             = $itemId
        AcceptedRequest    = $acceptedRequest
        LowRequest         = $lowRequest
        AcceptedPrice      = $afterDuplicate.Item.current_price.N
        StateVersion       = $afterDuplicate.Item.version.N
        AuditEventCount    = $eventCount
        DeadLetterQueue    = $dlqCount
        MatchingLogEvents  = @($logs.events).Count
        QueueAfterTest     = Get-QueueCount $queueUrl
    } | Format-List
}
finally {
    if ($seeded) {
        $events = Get-Events $eventsTable $itemId
        foreach ($event in @($events.Items)) {
            $key = @{
                item_id = @{ S = $itemId }
                sk      = @{ S = $event.sk.S }
            }
            Invoke-AwsJsonPayload @("dynamodb", "delete-item") @{
                TableName = $eventsTable
                Key       = $key
            } | Out-Null
        }

        Invoke-AwsJsonPayload @("dynamodb", "delete-item") @{
            TableName = $stateTable
            Key       = @{ item_id = @{ S = $itemId } }
        } | Out-Null
    }
}
