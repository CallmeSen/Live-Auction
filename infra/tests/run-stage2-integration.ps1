[CmdletBinding()]
param(
    [string]$Profile = 'la',
    [string]$Region = 'ap-southeast-1',
    [int]$TimeoutSeconds = 90,
    [int]$NoMessageSeconds = 6,
    [switch]$LeaveUsers
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

Remove-Item Env:AWS_ACCESS_KEY_ID, Env:AWS_SECRET_ACCESS_KEY, Env:AWS_SESSION_TOKEN -ErrorAction SilentlyContinue
$env:AWS_PROFILE = $Profile
$env:AWS_REGION = $Region
$env:AWS_DEFAULT_REGION = $Region

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Invoke-AwsJson {
    param([Parameter(Mandatory)][string[]]$Arguments)

    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $raw = & aws --profile $Profile --region $Region @Arguments --output json 2>&1
    $exitCode = $LASTEXITCODE
    $ErrorActionPreference = $previousPreference
    if ($exitCode -ne 0) {
        $operation = ($Arguments | Select-Object -First 2) -join ' '
        throw "AWS CLI operation failed: $operation (exit $exitCode)"
    }
    if (-not $raw) {
        return $null
    }
    return (($raw -join "`n") | ConvertFrom-Json)
}

function Invoke-AwsJsonPayload {
    param(
        [Parameter(Mandatory)][string[]]$Arguments,
        [Parameter(Mandatory)][hashtable]$Payload
    )

    $tempPath = Join-Path ([System.IO.Path]::GetTempPath()) `
        ("live-auction-stage2-" + [Guid]::NewGuid().ToString('N') + '.json')
    [System.IO.File]::WriteAllText(
        $tempPath,
        ($Payload | ConvertTo-Json -Compress -Depth 12),
        $utf8
    )
    try {
        return Invoke-AwsJson -Arguments (
            $Arguments + @('--cli-input-json', "file://$tempPath")
        )
    }
    finally {
        Remove-Item -LiteralPath $tempPath -Force -ErrorAction SilentlyContinue
    }
}

function Get-TerraformOutput {
    param(
        [Parameter(Mandatory)][string]$Module,
        [Parameter(Mandatory)][string]$Name
    )

    $modulePath = Join-Path $repoRoot $Module
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $raw = & terraform "-chdir=$modulePath" output -raw $Name 2>&1
    $exitCode = $LASTEXITCODE
    $ErrorActionPreference = $previousPreference
    if ($exitCode -ne 0) {
        throw "Terraform output failed for $Module/$Name"
    }
    $value = ($raw -join "`n").Trim()
    if ([string]::IsNullOrWhiteSpace($value)) {
        throw "Terraform output is empty for $Module/$Name"
    }
    return $value
}

function Wait-Until {
    param(
        [Parameter(Mandatory)][scriptblock]$Condition,
        [Parameter(Mandatory)][string]$Description,
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

function Get-AttributeString {
    param($Item, [string]$Name)

    if ($null -eq $Item) {
        return $null
    }
    $property = $Item.PSObject.Properties[$Name]
    if ($null -eq $property -or $null -eq $property.Value) {
        return $null
    }
    $stringProperty = $property.Value.PSObject.Properties['S']
    if ($null -eq $stringProperty) {
        return $null
    }
    return [string]$stringProperty.Value
}

function Get-MessageProperty {
    param($Message, [string]$Name)

    if ($null -eq $Message) {
        return $null
    }
    $property = $Message.PSObject.Properties[$Name]
    if ($null -eq $property) {
        return $null
    }
    return $property.Value
}

function Get-DynamoItem {
    param([string]$TableName, [string]$ItemId)

    return Invoke-AwsJsonPayload -Arguments @('dynamodb', 'get-item') -Payload @{
        TableName      = $TableName
        ConsistentRead = $true
        Key            = @{ item_id = @{ S = $ItemId } }
    }
}

function Get-PartitionItems {
    param([string]$TableName, [string]$ItemId)

    $response = Invoke-AwsJsonPayload -Arguments @('dynamodb', 'query') -Payload @{
        TableName                 = $TableName
        ConsistentRead            = $true
        KeyConditionExpression    = 'item_id = :item'
        ExpressionAttributeValues = @{ ':item' = @{ S = $ItemId } }
    }
    if ($null -eq $response -or $null -eq $response.Items) {
        return
    }
    return $response.Items
}

function Remove-DynamoItem {
    param([string]$TableName, [hashtable]$Key)

    Invoke-AwsJsonPayload -Arguments @('dynamodb', 'delete-item') -Payload @{
        TableName = $TableName
        Key       = $Key
    } | Out-Null
}

function Get-QueueCount {
    param([string]$QueueUrl)

    $response = Invoke-AwsJson -Arguments @(
        'sqs', 'get-queue-attributes',
        '--queue-url', $QueueUrl,
        '--attribute-names',
        'ApproximateNumberOfMessages',
        'ApproximateNumberOfMessagesNotVisible',
        'ApproximateNumberOfMessagesDelayed'
    )
    $attributes = $response.Attributes
    return [int]$attributes.ApproximateNumberOfMessages +
        [int]$attributes.ApproximateNumberOfMessagesNotVisible +
        [int]$attributes.ApproximateNumberOfMessagesDelayed
}

function New-TemporaryPassword {
    return 'Aa1!' + [Guid]::NewGuid().ToString('N') + 'zZ9@'
}

function New-CognitoBidder {
    param(
        [string]$PoolId,
        [string]$Username,
        [string]$Password
    )

    Invoke-AwsJson -Arguments @(
        'cognito-idp', 'admin-create-user',
        '--user-pool-id', $PoolId,
        '--username', $Username,
        '--user-attributes',
        "Name=email,Value=$Username",
        'Name=email_verified,Value=true',
        '--message-action', 'SUPPRESS'
    ) | Out-Null
    Invoke-AwsJson -Arguments @(
        'cognito-idp', 'admin-set-user-password',
        '--user-pool-id', $PoolId,
        '--username', $Username,
        '--password', $Password,
        '--permanent'
    ) | Out-Null
    Invoke-AwsJson -Arguments @(
        'cognito-idp', 'admin-add-user-to-group',
        '--user-pool-id', $PoolId,
        '--username', $Username,
        '--group-name', 'BIDDER'
    ) | Out-Null
}

function Get-CognitoSession {
    param(
        [string]$PoolId,
        [string]$ClientId,
        [string]$Username,
        [string]$Password
    )

    $user = Invoke-AwsJson -Arguments @(
        'cognito-idp', 'admin-get-user',
        '--user-pool-id', $PoolId,
        '--username', $Username
    )
    $subAttribute = @($user.UserAttributes | Where-Object { $_.Name -eq 'sub' })
    if ($subAttribute.Count -ne 1 -or [string]::IsNullOrWhiteSpace($subAttribute[0].Value)) {
        throw 'Cognito user sub is unavailable'
    }

    $auth = Invoke-AwsJson -Arguments @(
        'cognito-idp', 'admin-initiate-auth',
        '--user-pool-id', $PoolId,
        '--client-id', $ClientId,
        '--auth-flow', 'ADMIN_USER_PASSWORD_AUTH',
        '--auth-parameters', "USERNAME=$Username,PASSWORD=$Password"
    )
    $idToken = $auth.AuthenticationResult.IdToken
    if ([string]::IsNullOrWhiteSpace($idToken)) {
        throw 'Cognito IdToken is unavailable'
    }
    return [pscustomobject]@{
        Sub     = [string]$subAttribute[0].Value
        IdToken = [string]$idToken
    }
}

function Test-WebSocketDeniedException {
    param([System.Exception]$Exception)

    $current = $Exception
    $depth = 0
    while ($null -ne $current -and $depth -lt 8) {
        if ($current.Message -match '401|403|Forbidden|Unauthorized') {
            return $true
        }
        $current = $current.InnerException
        $depth++
    }
    return $false
}

function Open-WebSocket {
    param([string]$BaseUrl, [string]$Token, [int]$Timeout = 20)

    $socket = New-Object System.Net.WebSockets.ClientWebSocket
    $uri = New-Object System.Uri(
        $BaseUrl + '?token=' + [System.Uri]::EscapeDataString($Token)
    )
    $cts = New-Object System.Threading.CancellationTokenSource
    $cts.CancelAfter([TimeSpan]::FromSeconds($Timeout))
    try {
        [void]$socket.ConnectAsync($uri, $cts.Token).GetAwaiter().GetResult()
        return $socket
    }
    catch {
        $socket.Dispose()
        throw
    }
    finally {
        $cts.Dispose()
    }
}

function Send-WebSocketJson {
    param(
        [System.Net.WebSockets.ClientWebSocket]$Socket,
        [hashtable]$Payload
    )

    $bytes = $utf8.GetBytes(($Payload | ConvertTo-Json -Compress -Depth 8))
    $segment = New-Object 'System.ArraySegment[byte]' -ArgumentList @(, $bytes)
    $cts = New-Object System.Threading.CancellationTokenSource
    $cts.CancelAfter([TimeSpan]::FromSeconds(20))
    try {
        [void]$Socket.SendAsync(
            $segment,
            [System.Net.WebSockets.WebSocketMessageType]::Text,
            $true,
            $cts.Token
        ).GetAwaiter().GetResult()
    }
    catch [System.OperationCanceledException] {
        throw 'Timed out sending WebSocket message'
    }
    finally {
        $cts.Dispose()
    }
}

function Receive-WebSocketJson {
    param(
        [System.Net.WebSockets.ClientWebSocket]$Socket,
        [int]$Timeout
    )

    $buffer = New-Object byte[] 8192
    $stream = New-Object System.IO.MemoryStream
    $cts = New-Object System.Threading.CancellationTokenSource
    $cts.CancelAfter([TimeSpan]::FromSeconds($Timeout))
    try {
        do {
            $segment = New-Object 'System.ArraySegment[byte]' -ArgumentList @(, $buffer)
            try {
                $result = $Socket.ReceiveAsync(
                    $segment,
                    $cts.Token
                ).GetAwaiter().GetResult()
            }
            catch [System.OperationCanceledException] {
                throw (New-Object System.TimeoutException('WebSocket receive timed out'))
            }
            if ($result.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) {
                throw 'WebSocket closed before the expected message arrived'
            }
            $stream.Write($buffer, 0, $result.Count)
        } while (-not $result.EndOfMessage)

        $json = $utf8.GetString($stream.ToArray())
        return ($json | ConvertFrom-Json)
    }
    finally {
        $cts.Dispose()
        $stream.Dispose()
    }
}

function Receive-UntilMessage {
    param(
        [System.Net.WebSockets.ClientWebSocket]$Socket,
        [scriptblock]$Predicate,
        [string]$Description,
        [int]$Timeout = $TimeoutSeconds
    )

    $deadline = [DateTimeOffset]::UtcNow.AddSeconds($Timeout)
    do {
        $remaining = [Math]::Max(
            1,
            [int][Math]::Ceiling(($deadline - [DateTimeOffset]::UtcNow).TotalSeconds)
        )
        $message = Receive-WebSocketJson -Socket $Socket -Timeout $remaining
        if (& $Predicate $message) {
            return $message
        }
    } while ([DateTimeOffset]::UtcNow -lt $deadline)
    throw "Timed out waiting for $Description"
}

function Assert-NoWebSocketMessage {
    param(
        [System.Net.WebSockets.ClientWebSocket]$Socket,
        [int]$Timeout
    )

    try {
        $unexpected = Receive-WebSocketJson -Socket $Socket -Timeout $Timeout
        $type = if ($null -ne $unexpected.PSObject.Properties['type']) {
            [string]$unexpected.type
        }
        else {
            'unknown'
        }
        throw "Unexpected WebSocket message received: $type"
    }
    catch [System.TimeoutException] {
        return
    }
}

function Close-WebSocket {
    param($Socket)

    if ($null -eq $Socket) {
        return
    }
    $client = @($Socket | Where-Object {
        $_ -is [System.Net.WebSockets.ClientWebSocket]
    }) | Select-Object -Last 1
    if ($null -eq $client) {
        return
    }
    try {
        if ($client.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
            $cts = New-Object System.Threading.CancellationTokenSource
            $cts.CancelAfter([TimeSpan]::FromSeconds(10))
            try {
                [void]$client.CloseAsync(
                    [System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure,
                    'integration complete',
                    $cts.Token
                ).GetAwaiter().GetResult()
            }
            finally {
                $cts.Dispose()
            }
        }
    }
    catch {
        $client.Abort()
    }
    finally {
        $client.Dispose()
    }
}

function Get-TestConnectionRecords {
    param(
        [string]$TableName,
        [string]$ItemId,
        [string[]]$UserSubs
    )

    $rooms = @(Get-PartitionItems -TableName $TableName -ItemId $ItemId | Where-Object {
        $UserSubs -contains (Get-AttributeString $_ 'user_sub')
    })
    $auth = @(Get-PartitionItems -TableName $TableName -ItemId '__connection_auth__' | Where-Object {
        $UserSubs -contains (Get-AttributeString $_ 'user_sub')
    })
    return [pscustomobject]@{ Rooms = $rooms; Auth = $auth }
}

function Invoke-CleanupStep {
    param(
        [string]$Description,
        [scriptblock]$Action,
        [System.Collections.Generic.List[string]]$Errors
    )

    try {
        & $Action
    }
    catch {
        $Errors.Add($Description)
    }
}

$identity = Invoke-AwsJson -Arguments @('sts', 'get-caller-identity')
if ($identity.Account -ne '233376973052' -or
    $identity.Arn -ne 'arn:aws:iam::233376973052:user/la-admin') {
    throw 'Caller gate failed: use only profile la and IAM user la-admin'
}
if ($Profile -ne 'la' -or $Region -ne 'ap-southeast-1') {
    throw 'Integration is pinned to profile la and ap-southeast-1'
}

$poolId = Get-TerraformOutput 'infra/03-identity' 'cognito_user_pool_id'
$clientId = Get-TerraformOutput 'infra/03-identity' 'cognito_user_pool_client_id'
$webSocketUrl = Get-TerraformOutput 'infra/07-api' 'websocket_url'
$stateTable = Get-TerraformOutput 'infra/04-data' 'item_state_table_name'
$eventsTable = Get-TerraformOutput 'infra/04-data' 'bid_events_table_name'
$connectionsTable = Get-TerraformOutput 'infra/04-data' 'websocket_connections_table_name'
$aliasesTable = Get-TerraformOutput 'infra/04-data' 'bidder_aliases_table_name'
$queueUrl = Get-TerraformOutput 'infra/05-messaging' 'bid_commands_queue_url'
$dlqUrl = Get-TerraformOutput 'infra/05-messaging' 'bid_commands_dlq_url'

$runId = [DateTimeOffset]::UtcNow.ToString('yyyyMMddHHmmssfff')
$itemId = "stage2-$runId"
$acceptedRequestId = "accepted-$runId"
$rejectedRequestId = "rejected-$runId"
$forgedSub = "forged-$runId"
$usernameA = "stage2-$runId-a@example.invalid"
$usernameB = "stage2-$runId-b@example.invalid"
$passwordA = New-TemporaryPassword
$passwordB = New-TemporaryPassword
$sellerSub = "seller-$runId"
$endTime = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() + 600

$socketA = $null
$socketB = $null
$subA = $null
$subB = $null
$seeded = $false
$createdUsers = New-Object System.Collections.Generic.List[string]
$knownConnectionIds = New-Object System.Collections.Generic.HashSet[string]
$cleanupErrors = New-Object System.Collections.Generic.List[string]
$mainError = $null

try {
    if ((Get-QueueCount $queueUrl) -ne 0 -or (Get-QueueCount $dlqUrl) -ne 0) {
        throw 'Queue or DLQ is not empty before the Stage 2 integration test'
    }

    $invalidDenied = $false
    try {
        $invalidSocket = Open-WebSocket -BaseUrl $webSocketUrl -Token 'clearly-invalid-stage2-token'
        Close-WebSocket $invalidSocket
    }
    catch {
        if (Test-WebSocketDeniedException -Exception $_.Exception) {
            $invalidDenied = $true
        }
        else {
            throw 'Invalid-token handshake failed for an unexpected reason'
        }
    }
    if (-not $invalidDenied) {
        throw 'Invalid token unexpectedly established a WebSocket connection'
    }
    Write-Output 'invalid token: denied'

    New-CognitoBidder -PoolId $poolId -Username $usernameA -Password $passwordA
    $createdUsers.Add($usernameA)
    New-CognitoBidder -PoolId $poolId -Username $usernameB -Password $passwordB
    $createdUsers.Add($usernameB)

    $sessionA = Get-CognitoSession -PoolId $poolId -ClientId $clientId `
        -Username $usernameA -Password $passwordA
    $sessionB = Get-CognitoSession -PoolId $poolId -ClientId $clientId `
        -Username $usernameB -Password $passwordB
    $subA = $sessionA.Sub
    $subB = $sessionB.Sub

    Invoke-AwsJsonPayload -Arguments @('dynamodb', 'put-item') -Payload @{
        TableName = $stateTable
        Item      = [ordered]@{
            item_id         = @{ S = $itemId }
            current_price   = @{ N = '100' }
            status          = @{ S = 'LIVE' }
            owner_region    = @{ S = $Region }
            end_time        = @{ N = [string]$endTime }
            version         = @{ N = '1' }
            seller_sub      = @{ S = $sellerSub }
            extension_count = @{ N = '0' }
        }
    } | Out-Null
    $seeded = $true

    $socketA = Open-WebSocket -BaseUrl $webSocketUrl -Token $sessionA.IdToken
    $socketB = Open-WebSocket -BaseUrl $webSocketUrl -Token $sessionB.IdToken
    if ($socketA.State -ne [System.Net.WebSockets.WebSocketState]::Open -or
        $socketB.State -ne [System.Net.WebSockets.WebSocketState]::Open) {
        throw 'Valid Cognito users did not establish both WebSocket connections'
    }
    Write-Output 'two Cognito users: connected'

    Send-WebSocketJson -Socket $socketA -Payload @{
        action   = 'joinRoom'
        item_id  = $itemId
        user_sub = $forgedSub
    }
    Receive-UntilMessage -Socket $socketA -Description 'room A acknowledgement' -Predicate {
        param($message)
        (Get-MessageProperty $message 'type') -eq 'room_joined' -and
            (Get-MessageProperty $message 'item_id') -eq $itemId
    } | Out-Null

    Send-WebSocketJson -Socket $socketB -Payload @{
        action   = 'joinRoom'
        item_id  = $itemId
        user_sub = $forgedSub
    }
    Receive-UntilMessage -Socket $socketB -Description 'room B acknowledgement' -Predicate {
        param($message)
        (Get-MessageProperty $message 'type') -eq 'room_joined' -and
            (Get-MessageProperty $message 'item_id') -eq $itemId
    } | Out-Null

    $connectionRecords = Wait-Until -Description 'two trusted connection records' -Condition {
        $records = Get-TestConnectionRecords -TableName $connectionsTable `
            -ItemId $itemId -UserSubs @($subA, $subB)
        if ($records.Rooms.Count -eq 2 -and $records.Auth.Count -eq 2) {
            return $records
        }
        return $null
    }
    foreach ($room in $connectionRecords.Rooms) {
        $connectionId = Get-AttributeString $room 'connection_id'
        if (-not [string]::IsNullOrWhiteSpace($connectionId)) {
            [void]$knownConnectionIds.Add($connectionId)
        }
    }

    Send-WebSocketJson -Socket $socketA -Payload @{
        action     = 'placeBid'
        item_id    = $itemId
        amount     = '150'
        request_id = $acceptedRequestId
        user_sub   = $forgedSub
    }
    $acceptedA = Receive-UntilMessage -Socket $socketA -Description 'accepted update for A' -Predicate {
        param($message)
        (Get-MessageProperty $message 'type') -eq 'price_update' -and
            (Get-MessageProperty $message 'request_id') -eq $acceptedRequestId
    }
    $acceptedB = Receive-UntilMessage -Socket $socketB -Description 'accepted update for B' -Predicate {
        param($message)
        (Get-MessageProperty $message 'type') -eq 'price_update' -and
            (Get-MessageProperty $message 'request_id') -eq $acceptedRequestId
    }
    if ([string]$acceptedA.current_price -ne '150' -or
        [string]$acceptedB.current_price -ne '150') {
        throw 'Accepted fan-out carried the wrong current price'
    }
    Write-Output 'accepted bid: delivered to 2 connections'

    $acceptedAudit = Wait-Until -Description 'trusted accepted audit identity' -Condition {
        $events = @(Get-PartitionItems -TableName $eventsTable -ItemId $itemId)
        return @($events | Where-Object {
            (Get-AttributeString $_ 'request_id') -eq $acceptedRequestId
        }) | Select-Object -First 1
    }
    $state = Get-DynamoItem -TableName $stateTable -ItemId $itemId
    if ((Get-AttributeString $acceptedAudit 'bidder_sub') -ne $subA -or
        (Get-AttributeString $acceptedAudit 'bidder_sub') -eq $forgedSub -or
        (Get-AttributeString $state.Item 'highest_bidder_id') -ne $subA) {
        throw 'Forged user_sub was not replaced with the trusted Cognito sub'
    }
    Write-Output 'forged user_sub: ignored'

    Send-WebSocketJson -Socket $socketB -Payload @{
        action     = 'placeBid'
        item_id    = $itemId
        amount     = '150'
        request_id = $rejectedRequestId
        user_sub   = $forgedSub
    }
    $rejectedB = Receive-UntilMessage -Socket $socketB -Description 'targeted rejection for B' -Predicate {
        param($message)
        (Get-MessageProperty $message 'type') -eq 'bid_result' -and
            (Get-MessageProperty $message 'request_id') -eq $rejectedRequestId
    }
    if ($rejectedB.status -ne 'REJECTED' -or
        $rejectedB.reason -ne 'REJECTED_LOW_INCREMENT') {
        throw 'Low bid did not produce the expected targeted rejection'
    }
    Assert-NoWebSocketMessage -Socket $socketA -Timeout $NoMessageSeconds
    Write-Output 'rejected bid: delivered to origin only'

    Wait-Until -Description 'bid queue drain' -Condition {
        (Get-QueueCount $queueUrl) -eq 0
    } | Out-Null
    if ((Get-QueueCount $dlqUrl) -ne 0) {
        throw 'The Stage 2 integration test added a DLQ message'
    }

    Close-WebSocket $socketA
    $socketA = $null
    Close-WebSocket $socketB
    $socketB = $null

    $disconnectCleaned = $false
    try {
        Wait-Until -Description 'disconnect record cleanup' -Timeout 20 -Condition {
            $records = Get-TestConnectionRecords -TableName $connectionsTable `
                -ItemId $itemId -UserSubs @($subA, $subB)
            $records.Rooms.Count -eq 0 -and $records.Auth.Count -eq 0
        } | Out-Null
        $disconnectCleaned = $true
    }
    catch {
        $disconnectCleaned = $false
    }
    Write-Output 'disconnect cleanup: verified or TTL fallback recorded'
    Write-Output 'queue and DLQ: no unexpected messages'
}
catch {
    $mainError = $_
}
finally {
    Close-WebSocket $socketA
    Close-WebSocket $socketB

    if (-not [string]::IsNullOrWhiteSpace($connectionsTable) -and
        -not [string]::IsNullOrWhiteSpace($itemId)) {
        Invoke-CleanupStep -Description 'connection fixtures' -Errors $cleanupErrors -Action {
            foreach ($room in @(Get-PartitionItems -TableName $connectionsTable -ItemId $itemId)) {
                $connectionId = Get-AttributeString $room 'connection_id'
                if (-not [string]::IsNullOrWhiteSpace($connectionId)) {
                    Remove-DynamoItem -TableName $connectionsTable -Key @{
                        item_id      = @{ S = $itemId }
                        connection_id = @{ S = $connectionId }
                    }
                }
            }
            $testSubs = @($subA, $subB) | Where-Object {
                -not [string]::IsNullOrWhiteSpace($_)
            }
            foreach ($auth in @(Get-PartitionItems -TableName $connectionsTable -ItemId '__connection_auth__')) {
                $connectionId = Get-AttributeString $auth 'connection_id'
                $userSub = Get-AttributeString $auth 'user_sub'
                if (($testSubs -contains $userSub) -or
                    $knownConnectionIds.Contains($connectionId)) {
                    Remove-DynamoItem -TableName $connectionsTable -Key @{
                        item_id       = @{ S = '__connection_auth__' }
                        connection_id = @{ S = $connectionId }
                    }
                }
            }
        }
    }

    if ($seeded) {
        Invoke-CleanupStep -Description 'audit fixtures' -Errors $cleanupErrors -Action {
            foreach ($event in @(Get-PartitionItems -TableName $eventsTable -ItemId $itemId)) {
                $sk = Get-AttributeString $event 'sk'
                if (-not [string]::IsNullOrWhiteSpace($sk)) {
                    Remove-DynamoItem -TableName $eventsTable -Key @{
                        item_id = @{ S = $itemId }
                        sk      = @{ S = $sk }
                    }
                }
            }
        }
        Invoke-CleanupStep -Description 'alias fixtures' -Errors $cleanupErrors -Action {
            foreach ($alias in @(Get-PartitionItems -TableName $aliasesTable -ItemId $itemId)) {
                $userId = Get-AttributeString $alias 'user_id'
                if (-not [string]::IsNullOrWhiteSpace($userId)) {
                    Remove-DynamoItem -TableName $aliasesTable -Key @{
                        item_id = @{ S = $itemId }
                        user_id = @{ S = $userId }
                    }
                }
            }
        }
        Invoke-CleanupStep -Description 'auction state fixture' -Errors $cleanupErrors -Action {
            Remove-DynamoItem -TableName $stateTable -Key @{
                item_id = @{ S = $itemId }
            }
        }
    }

    if (-not $LeaveUsers) {
        foreach ($username in $createdUsers) {
            Invoke-CleanupStep -Description 'Cognito test user' -Errors $cleanupErrors -Action {
                Invoke-AwsJson -Arguments @('cognito-idp', 'admin-delete-user', '--user-pool-id', $poolId, '--username', $username) | Out-Null
            }
        }
    }
}

$passwordA = $null
$passwordB = $null

if ($null -ne $mainError) {
    throw $mainError
}
if ($cleanupErrors.Count -ne 0) {
    throw "Scoped cleanup failed: $($cleanupErrors -join ', ')"
}
