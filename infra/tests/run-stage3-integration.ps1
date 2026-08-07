[CmdletBinding()]
param(
    [string]$Profile = 'la-admin',
    [string]$Region = 'ap-southeast-1',
    [int]$TimeoutSeconds = 420,
    [switch]$RunStage4LiveE2E,
    [switch]$RunStage4AdminLiveCheckpoint,
    [string]$BootstrapAdminUsername = '',
    [string]$BootstrapAdminPasswordEnvironmentVariable = 'LIVE_AUCTION_BOOTSTRAP_ADMIN_PASSWORD'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$ProgressPreference = 'SilentlyContinue'

$expectedAccount = '233376973052'
$expectedArn = 'arn:aws:iam::233376973052:user/la-admin'
$script:CallerGatePassed = $false
$script:TerraformCredentials = $null
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$utf8 = New-Object System.Text.UTF8Encoding($false)
$terraformOutputAttempts = 3

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

function Invoke-AwsJsonPayload {
    param(
        [Parameter(Mandatory)][string[]]$Arguments,
        [Parameter(Mandatory)]$Payload
    )

    Assert-CallerGatePassed
    $tempPath = Join-Path ([System.IO.Path]::GetTempPath()) `
        ('live-auction-stage3-' + [Guid]::NewGuid().ToString('N') + '.json')
    [System.IO.File]::WriteAllText(
        $tempPath,
        ($Payload | ConvertTo-Json -Compress -Depth 30),
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

function Initialize-TerraformCredentials {
    Assert-CallerGatePassed
    $credentials = Invoke-AwsJson -Arguments @(
        'configure', 'export-credentials', '--format', 'process'
    )
    $expectedProperties = @(
        'Version',
        'AccessKeyId',
        'SecretAccessKey',
        'SessionToken',
        'Expiration'
    ) | Sort-Object
    $actualProperties = @(
        $credentials.PSObject.Properties.Name | Sort-Object
    )
    if (($actualProperties -join '|') -ne ($expectedProperties -join '|') -or
        [int]$credentials.Version -ne 1 -or
        [string]::IsNullOrWhiteSpace([string]$credentials.AccessKeyId) -or
        [string]::IsNullOrWhiteSpace([string]$credentials.SecretAccessKey) -or
        [string]::IsNullOrWhiteSpace([string]$credentials.SessionToken) -or
        [string]::IsNullOrWhiteSpace([string]$credentials.Expiration)) {
        throw 'AWS login session export is incomplete'
    }
    $script:TerraformCredentials = $credentials
}

function Get-TerraformOutput {
    param(
        [Parameter(Mandatory)][string]$Module,
        [Parameter(Mandatory)][string]$Name,
        [switch]$Json
    )

    Assert-CallerGatePassed
    if ($null -eq $script:TerraformCredentials) {
        throw 'Terraform credentials have not been initialized'
    }
    $modulePath = Join-Path $repoRoot $Module
    $arguments = @("-chdir=$modulePath", 'output')
    if ($Json) {
        $arguments += '-json'
    }
    else {
        $arguments += '-raw'
    }
    $arguments += $Name

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
    $raw = @()
    $exitCode = 1
    try {
        for ($attempt = 1; $attempt -le $terraformOutputAttempts; $attempt++) {
            $previousPreference = $ErrorActionPreference
            try {
                $ErrorActionPreference = 'Continue'
                $raw = & terraform @arguments 2>&1
                $exitCode = $LASTEXITCODE
            }
            finally {
                $ErrorActionPreference = $previousPreference
            }
            if ($exitCode -eq 0) {
                break
            }
            if ($attempt -lt $terraformOutputAttempts) {
                Start-Sleep -Seconds $attempt
            }
        }
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
        throw "Terraform output failed after $terraformOutputAttempts attempts for $Module/$Name"
    }
    $value = ($raw -join "`n").Trim()
    if ([string]::IsNullOrWhiteSpace($value) -or $value -eq 'null') {
        throw "Terraform output is empty for $Module/$Name"
    }
    if ($Json) {
        return ($value | ConvertFrom-Json)
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
    $backoff = 1
    do {
        $value = & $Condition
        if ($value) {
            return $value
        }
        Start-Sleep -Seconds $backoff
        $backoff = [Math]::Min($backoff + 1, 5)
    } while ([DateTimeOffset]::UtcNow -lt $deadline)
    throw "Timed out waiting for $Description"
}

function Assert-ExactProperties {
    param(
        [Parameter(Mandatory)]$Value,
        [Parameter(Mandatory)][string[]]$Names,
        [Parameter(Mandatory)][string]$Description
    )

    if ($null -eq $Value) {
        throw "$Description is missing"
    }
    $actual = @($Value.PSObject.Properties.Name | Sort-Object)
    $expected = @($Names | Sort-Object)
    if (($actual -join '|') -ne ($expected -join '|')) {
        throw "$Description has unexpected fields"
    }
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

function ConvertTo-CurlConfigValue {
    param([Parameter(Mandatory)][string]$Value)

    return $Value.Replace('\', '\\').Replace('"', '\"').Replace("`r", '').Replace("`n", '')
}


function Invoke-HttpClientResponse {
    param(
        [Parameter(Mandatory)][string]$Method,
        [Parameter(Mandatory)][string]$Uri,
        [Parameter(Mandatory)][string]$ApiKey,
        [Parameter(Mandatory)][string]$IdToken,
        $Body
    )

    Add-Type -AssemblyName System.Net.Http -ErrorAction SilentlyContinue
    $client = New-Object -TypeName System.Net.Http.HttpClient
    $request = New-Object -TypeName System.Net.Http.HttpRequestMessage
    try {
        $request.Method = New-Object -TypeName System.Net.Http.HttpMethod `
            -ArgumentList @($Method)
        $request.RequestUri = New-Object -TypeName System.Uri `
            -ArgumentList @($Uri)
        $request.Headers.TryAddWithoutValidation(
            'Authorization',
            "Bearer $IdToken"
        ) | Out-Null
        $request.Headers.TryAddWithoutValidation('x-api-key', $ApiKey) | Out-Null
        if ($null -ne $Body) {
            $request.Content = New-Object -TypeName System.Net.Http.StringContent `
                -ArgumentList @(
                    [string]$Body,
                    [System.Text.Encoding]::UTF8,
                    'application/json'
                )
        }
        $response = $client.SendAsync($request).GetAwaiter().GetResult()
        $content = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        return [pscustomobject]@{
            StatusCode = [int]$response.StatusCode
            Content    = [string]$content
        }
    }
    finally {
        if ($null -ne $request) {
            $request.Dispose()
        }
        $client.Dispose()
    }
}


function Invoke-CurlResponse {
    param(
        [Parameter(Mandatory)][string]$Method,
        [Parameter(Mandatory)][string]$Uri,
        [Parameter(Mandatory)][string]$ApiKey,
        [Parameter(Mandatory)][string]$IdToken,
        $Body
    )

    $marker = '__LIVE_AUCTION_CURL_STATUS__'
    $config = @(
        "url = `"$(ConvertTo-CurlConfigValue $Uri)`"",
        "request = `"$(ConvertTo-CurlConfigValue $Method)`"",
        "header = `"Authorization: Bearer $(ConvertTo-CurlConfigValue $IdToken)`"",
        "header = `"x-api-key: $(ConvertTo-CurlConfigValue $ApiKey)`"",
        'silent',
        'show-error',
        "write-out = `"\\n$marker%{http_code}`""
    )
    if ($null -ne $Body) {
        $config += 'header = "Content-Type: application/json"'
        $config += "data = `"$(ConvertTo-CurlConfigValue $Body)`""
    }

    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = 'curl.exe'
    $startInfo.Arguments = '--config -'
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    $started = $false
    $stdout = ''
    $stderr = ''
    $exitCode = -1
    try {
        $started = $process.Start()
        if (-not $started) {
            throw 'curl fallback process could not start'
        }
        $configBytes = [System.Text.Encoding]::UTF8.GetBytes($config -join "`n")
        $inputStream = $process.StandardInput.BaseStream
        $inputStream.Write(
            $configBytes,
            0,
            $configBytes.Length
        )
        $inputStream.Close()
        $stdout = $process.StandardOutput.ReadToEnd()
        $stderr = $process.StandardError.ReadToEnd()
        $process.WaitForExit()
        $exitCode = $process.ExitCode
    }
    finally {
        if ($started -and -not $process.HasExited) {
            $process.Kill()
        }
        $process.Dispose()
    }
    $raw = if ([string]::IsNullOrEmpty($stdout)) { @() } else { @($stdout) }
    if ($exitCode -ne 0) {
        $diagnostic = $stderr.Trim()
        if ($diagnostic.Length -gt 240) {
            $diagnostic = $diagnostic.Substring(0, 240)
        }
        if ([string]::IsNullOrWhiteSpace($diagnostic)) {
            $diagnostic = 'no curl diagnostic output'
        }
        throw "curl fallback request failed for $Method (exit code $exitCode): $diagnostic"
    }
    $response = $raw -join "`n"
    $match = [regex]::Match(
        $response,
        "(?s)^(?<content>.*)$marker(?<status>\d{3})\s*$"
    )
    if (-not $match.Success) {
        throw 'curl fallback response did not include an HTTP status'
    }
    return [pscustomobject]@{
        StatusCode = [int]$match.Groups['status'].Value
        Content    = $match.Groups['content'].Value.TrimEnd("`r", "`n")
    }
}


function Invoke-RestJson {
    param(
        [Parameter(Mandatory)][string]$Method,
        [Parameter(Mandatory)][string]$BaseUrl,
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$ApiKey,
        [Parameter(Mandatory)][string]$IdToken,
        $Body
    )

    Assert-CallerGatePassed
    $headers = @{
        Authorization = "Bearer $IdToken"
        'x-api-key'    = $ApiKey
    }
    $request = @{
        Uri             = $BaseUrl.TrimEnd('/') + $Path
        Method          = $Method
        Headers         = $headers
        UseBasicParsing = $true
    }
    if ($null -ne $Body) {
        $request.ContentType = 'application/json'
        $request.Body = $Body | ConvertTo-Json -Compress -Depth 12
    }

    $statusCode = 0
    $content = ''
    try {
        $response = Invoke-WebRequest @request
        $statusCode = [int]$response.StatusCode
        $content = [string]$response.Content
    }
    catch [System.Net.WebException] {
        $errorResponse = $_.Exception.Response
        if ($null -eq $errorResponse) {
            throw 'REST request failed before receiving an HTTP response'
        }
        $statusCode = [int]$errorResponse.StatusCode
        $stream = $errorResponse.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        try {
            $content = $reader.ReadToEnd()
        }
        finally {
            $reader.Dispose()
            $stream.Dispose()
        }
    }
    $fallbackBody = $null
    if ($request.ContainsKey('Body')) {
        $fallbackBody = [string]$request.Body
    }
    if ([string]::IsNullOrWhiteSpace($content) -and
        $statusCode -ge 400 -and $statusCode -lt 500) {
        try {
            $fallback = Invoke-HttpClientResponse -Method $Method -Uri $request.Uri `
                -ApiKey $ApiKey -IdToken $IdToken -Body $fallbackBody
        }
        catch {
            $httpClientError = $_
            try {
                $fallback = Invoke-CurlResponse -Method $Method -Uri $request.Uri `
                    -ApiKey $ApiKey -IdToken $IdToken -Body $fallbackBody
            }
            catch {
                $httpDiagnostic = [string]$httpClientError.Exception.Message
                $curlDiagnostic = [string]$_.Exception.Message
                foreach ($secret in @($IdToken, $ApiKey)) {
                    if (-not [string]::IsNullOrWhiteSpace($secret)) {
                        $httpDiagnostic = $httpDiagnostic.Replace($secret, '<redacted>')
                        $curlDiagnostic = $curlDiagnostic.Replace($secret, '<redacted>')
                    }
                }
                throw "REST error-body recovery failed (HttpClient: $httpDiagnostic; curl: $curlDiagnostic)"
            }
        }
        $statusCode = $fallback.StatusCode
        $content = $fallback.Content
    }

    $json = $null
    if (-not [string]::IsNullOrWhiteSpace($content)) {
        try {
            $json = $content | ConvertFrom-Json
        }
        catch {
            throw "REST response for $Method $Path is not valid JSON"
        }
    }
    return [pscustomobject]@{
        StatusCode = $statusCode
        Body       = $json
    }
}

function Assert-RestEnvelope {
    param(
        [Parameter(Mandatory)]$Response,
        [Parameter(Mandatory)][int]$StatusCode,
        [Parameter(Mandatory)][string]$Code,
        [Parameter(Mandatory)][string[]]$DataProperties
    )

    if ($Response.StatusCode -ne $StatusCode) {
        $actualCode = [string](Get-OptionalProperty $Response.Body 'code')
        $actualMessage = [string](Get-OptionalProperty $Response.Body 'message')
        throw "REST $Code expected HTTP $StatusCode but received $($Response.StatusCode) ($actualCode): $actualMessage"
    }
    Assert-ExactProperties -Value $Response.Body `
        -Names @('status', 'code', 'message', 'data') -Description 'REST envelope'
    if ([int]$Response.Body.status -ne $StatusCode -or
        [string]$Response.Body.code -ne $Code) {
        throw 'REST envelope status or code is unexpected'
    }
    Assert-ExactProperties -Value $Response.Body.data `
        -Names $DataProperties -Description 'REST data'
    return $Response.Body.data
}

function New-TemporaryPassword {
    $bytes = New-Object byte[] 36
    $random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $random.GetBytes($bytes)
    }
    finally {
        $random.Dispose()
    }
    $randomText = [Convert]::ToBase64String($bytes).TrimEnd('=')
    return 'Aa1!' + $randomText + 'zZ9@'
}

function New-CognitoFixtureUser {
    param(
        [Parameter(Mandatory)][string]$PoolId,
        [Parameter(Mandatory)][string]$Username,
        [Parameter(Mandatory)][string]$Password,
        [Parameter(Mandatory)][ValidateSet('USER', 'ADMIN')][string]$Group,
        [Parameter(Mandatory)]
        [AllowEmptyCollection()]
        [System.Collections.Generic.List[string]]$CreatedUsers,
        [switch]$Temporary
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
    $CreatedUsers.Add($Username)

    $passwordPayload = @{
        UserPoolId = $PoolId
        Username   = $Username
        Password   = $Password
        Permanent  = $true
    }
    if ($Temporary) {
        $passwordPayload.Permanent = $false
    }
    Invoke-AwsJsonPayload -Arguments @(
        'cognito-idp', 'admin-set-user-password'
    ) -Payload $passwordPayload | Out-Null
    Invoke-AwsJson -Arguments @(
        'cognito-idp', 'admin-add-user-to-group',
        '--user-pool-id', $PoolId,
        '--username', $Username,
        '--group-name', $Group
    ) | Out-Null
}

function Get-CognitoIdentity {
    param(
        [Parameter(Mandatory)][string]$PoolId,
        [Parameter(Mandatory)][string]$ClientId,
        [Parameter(Mandatory)][string]$Username,
        [Parameter(Mandatory)][string]$Password
    )

    $user = Invoke-AwsJson -Arguments @(
        'cognito-idp', 'admin-get-user',
        '--user-pool-id', $PoolId,
        '--username', $Username
    )
    $subAttributes = @($user.UserAttributes | Where-Object { $_.Name -eq 'sub' })
    if ($subAttributes.Count -ne 1 -or
        [string]::IsNullOrWhiteSpace([string]$subAttributes[0].Value)) {
        throw 'Cognito fixture sub is unavailable'
    }

    $auth = Invoke-AwsJsonPayload -Arguments @(
        'cognito-idp', 'admin-initiate-auth'
    ) -Payload @{
        UserPoolId    = $PoolId
        ClientId      = $ClientId
        AuthFlow      = 'ADMIN_USER_PASSWORD_AUTH'
        AuthParameters = @{
            USERNAME = $Username
            PASSWORD = $Password
        }
    }
    $idToken = ''
    if ($null -ne $auth.PSObject.Properties['AuthenticationResult']) {
        $idToken = [string]$auth.AuthenticationResult.IdToken
    }
    if ([string]::IsNullOrWhiteSpace($idToken) -and
        [string]$auth.ChallengeName -eq 'NEW_PASSWORD_REQUIRED') {
        $challengePassword = New-TemporaryPassword
        $challenge = Invoke-AwsJsonPayload -Arguments @(
            'cognito-idp', 'respond-to-auth-challenge'
        ) -Payload @{
            ClientId      = $ClientId
            ChallengeName = 'NEW_PASSWORD_REQUIRED'
            Session       = [string]$auth.Session
            ChallengeResponses = @{
                USERNAME    = $Username
                NEW_PASSWORD = $challengePassword
            }
        }
        if ($null -ne $challenge.PSObject.Properties['AuthenticationResult']) {
            $auth = Invoke-AwsJsonPayload -Arguments @(
                'cognito-idp', 'admin-initiate-auth'
            ) -Payload @{
                UserPoolId    = $PoolId
                ClientId      = $ClientId
                AuthFlow      = 'ADMIN_USER_PASSWORD_AUTH'
                AuthParameters = @{
                    USERNAME = $Username
                    PASSWORD = $challengePassword
                }
            }
            $idToken = [string]$auth.AuthenticationResult.IdToken
        }
    }
    $auth = $null
    if ([string]::IsNullOrWhiteSpace($idToken)) {
        throw 'Cognito fixture ID token is unavailable'
    }
    return [pscustomobject]@{
        Sub     = [string]$subAttributes[0].Value
        IdToken = $idToken
    }
}

function Get-DynamoItem {
    param(
        [Parameter(Mandatory)][string]$TableName,
        [Parameter(Mandatory)][hashtable]$Key
    )

    $response = Invoke-AwsJsonPayload -Arguments @('dynamodb', 'get-item') `
        -Payload @{
            TableName      = $TableName
            ConsistentRead = $true
            Key            = $Key
        }
    if ($null -eq $response) {
        return $null
    }
    return (Get-OptionalProperty $response 'Item')
}

function Get-DynamoString {
    param($Item, [Parameter(Mandatory)][string]$Name)

    if ($null -eq $Item) {
        return $null
    }
    $property = $Item.PSObject.Properties[$Name]
    if ($null -eq $property -or $null -eq $property.Value) {
        return $null
    }
    $typed = $property.Value.PSObject.Properties['S']
    if ($null -eq $typed) {
        return $null
    }
    return [string]$typed.Value
}

function Get-DynamoNumber {
    param($Item, [Parameter(Mandatory)][string]$Name)

    if ($null -eq $Item) {
        return $null
    }
    $property = $Item.PSObject.Properties[$Name]
    if ($null -eq $property -or $null -eq $property.Value) {
        return $null
    }
    $typed = $property.Value.PSObject.Properties['N']
    if ($null -eq $typed) {
        return $null
    }
    return [long]$typed.Value
}

function Get-DynamoPartitionItems {
    param(
        [Parameter(Mandatory)][string]$TableName,
        [Parameter(Mandatory)][string]$PartitionKeyName,
        [Parameter(Mandatory)][string]$PartitionValue
    )

    $items = New-Object System.Collections.Generic.List[object]
    $lastKey = $null
    do {
        $payload = @{
            TableName                 = $TableName
            ConsistentRead            = $true
            KeyConditionExpression    = '#partition = :partition'
            ExpressionAttributeNames  = @{ '#partition' = $PartitionKeyName }
            ExpressionAttributeValues = @{
                ':partition' = @{ S = $PartitionValue }
            }
        }
        if ($null -ne $lastKey) {
            $payload.ExclusiveStartKey = $lastKey
        }
        $response = Invoke-AwsJsonPayload -Arguments @('dynamodb', 'query') `
            -Payload $payload
        foreach ($item in @(Get-OptionalCollection $response 'Items')) {
            $items.Add($item)
        }
        $lastKey = Get-OptionalProperty $response 'LastEvaluatedKey'
    } while ($null -ne $lastKey -and
        @($lastKey.PSObject.Properties).Count -ne 0)
    return $items.ToArray()
}

function Get-ScopedCatalogSessionIds {
    [CmdletBinding(DefaultParameterSetName = 'Seller')]
    param(
        [Parameter(Mandatory)][string]$TableName,
        [Parameter(Mandatory, ParameterSetName = 'Seller')][string]$SellerSub,
        [Parameter(Mandatory, ParameterSetName = 'Title')][string]$FixtureTitle,
        [switch]$RequireSessionId,
        [switch]$AllowMissingSessionId
    )

    if ($RequireSessionId -and $AllowMissingSessionId) {
        throw 'Scoped catalog discovery received conflicting validation options'
    }
    $sessionIds = New-Object System.Collections.Generic.List[string]
    $lastKey = $null
    do {
        $attributeNames = @{ '#entity_type' = 'entity_type' }
        $attributeValues = @{ ':session' = @{ S = 'SESSION' } }
        if ($PSCmdlet.ParameterSetName -eq 'Seller') {
            $filterExpression = '#entity_type = :session AND #seller_sub = :seller_sub'
            $attributeNames['#seller_sub'] = 'seller_sub'
            $attributeValues[':seller_sub'] = @{ S = $SellerSub }
        }
        else {
            $filterExpression = '#entity_type = :session AND #title = :title'
            $attributeNames['#title'] = 'title'
            $attributeValues[':title'] = @{ S = $FixtureTitle }
        }
        $payload = @{
            TableName                 = $TableName
            ConsistentRead            = $true
            FilterExpression          = $filterExpression
            ExpressionAttributeNames  = $attributeNames
            ExpressionAttributeValues = $attributeValues
        }
        if ($null -ne $lastKey) {
            $payload.ExclusiveStartKey = $lastKey
        }
        $response = Invoke-AwsJsonPayload -Arguments @('dynamodb', 'scan') `
            -Payload $payload
        foreach ($item in @(Get-OptionalCollection $response 'Items')) {
            $entityType = Get-DynamoString $item 'entity_type'
            $recordSellerSub = Get-DynamoString $item 'seller_sub'
            $recordTitle = Get-DynamoString $item 'title'
            $recordPk = Get-DynamoString $item 'pk'
            $recordSk = Get-DynamoString $item 'sk'
            $recordSessionId = Get-DynamoString $item 'session_id'
            $pkMatch = [regex]::Match(
                [string]$recordPk,
                '^SESSION#([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$',
                [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
            )
            if ($entityType -ne 'SESSION' -or $recordSk -ne 'META' -or
                -not $pkMatch.Success) {
                throw 'Scoped catalog discovery returned an invalid record'
            }
            $partitionSessionId = [string]$pkMatch.Groups[1].Value
            if ($PSCmdlet.ParameterSetName -eq 'Seller' -and
                $recordSellerSub -ne $SellerSub) {
                throw 'Scoped catalog discovery returned an invalid seller record'
            }
            if ($PSCmdlet.ParameterSetName -eq 'Title' -and
                $recordTitle -ne $FixtureTitle) {
                throw 'Scoped catalog discovery returned an invalid title record'
            }
            if ([string]::IsNullOrWhiteSpace($recordSessionId)) {
                if ($RequireSessionId -or -not $AllowMissingSessionId) {
                    throw 'Scoped catalog discovery returned a missing session ID'
                }
            }
            elseif ($recordSessionId -cne $partitionSessionId) {
                throw 'Scoped catalog discovery returned a mismatched session ID'
            }
            if (-not $sessionIds.Contains($partitionSessionId)) {
                $sessionIds.Add($partitionSessionId)
            }
        }
        $lastKey = Get-OptionalProperty $response 'LastEvaluatedKey'
    } while ($null -ne $lastKey -and
        @($lastKey.PSObject.Properties).Count -ne 0)
    return $sessionIds.ToArray()
}

function Remove-DynamoKeysBatch {
    param(
        [Parameter(Mandatory)][string]$TableName,
        [Parameter(Mandatory)][object[]]$Keys
    )

    $pending = New-Object System.Collections.Generic.List[object]
    foreach ($key in @($Keys)) {
        $pending.Add(@{ DeleteRequest = @{ Key = $key } })
    }
    $retryBackoff = 1
    $retryDeadline = [DateTimeOffset]::UtcNow.AddSeconds(60)
    while ($pending.Count -gt 0) {
        $chunk = $pending.GetRange(0, [Math]::Min(25, $pending.Count))
        $pending.RemoveRange(0, $chunk.Count)
        $requestItems = @{}
        $requestItems[$TableName] = $chunk.ToArray()
        $response = Invoke-AwsJsonPayload -Arguments @(
            'dynamodb', 'batch-write-item'
        ) -Payload @{ RequestItems = $requestItems }

        $unprocessed = New-Object System.Collections.Generic.List[object]
        $unprocessedItems = Get-OptionalProperty $response 'UnprocessedItems'
        if ($null -ne $unprocessedItems) {
            foreach ($request in @(
                Get-OptionalCollection $unprocessedItems $TableName
            )) {
                $unprocessed.Add($request)
            }
        }
        foreach ($request in $unprocessed.ToArray()) {
            $pending.Add($request)
        }
        if ($unprocessed.Count -gt 0) {
            if ([DateTimeOffset]::UtcNow -ge $retryDeadline) {
                throw 'DynamoDB batch cleanup retained unprocessed items past its deadline'
            }
            Start-Sleep -Seconds $retryBackoff
            $retryBackoff = [Math]::Min($retryBackoff + 1, 5)
        }
        else {
            $retryBackoff = 1
        }
    }
}

function Get-QueueCount {
    param([Parameter(Mandatory)][string]$QueueUrl)

    $response = Invoke-AwsJson -Arguments @(
        'sqs', 'get-queue-attributes',
        '--queue-url', $QueueUrl,
        '--attribute-names',
        'ApproximateNumberOfMessages',
        'ApproximateNumberOfMessagesNotVisible',
        'ApproximateNumberOfMessagesDelayed'
    )
    $attributes = $response.Attributes
    return [long]$attributes.ApproximateNumberOfMessages +
        [long]$attributes.ApproximateNumberOfMessagesNotVisible +
        [long]$attributes.ApproximateNumberOfMessagesDelayed
}

function Invoke-AdminCommand {
    param(
        [Parameter(Mandatory)][string]$FunctionName,
        [Parameter(Mandatory)][hashtable]$Payload
    )

    Assert-CallerGatePassed
    $inputPath = Join-Path ([System.IO.Path]::GetTempPath()) `
        ('live-auction-stage3-lambda-in-' + [Guid]::NewGuid().ToString('N') + '.json')
    $outputPath = Join-Path ([System.IO.Path]::GetTempPath()) `
        ('live-auction-stage3-lambda-out-' + [Guid]::NewGuid().ToString('N') + '.json')
    [System.IO.File]::WriteAllText(
        $inputPath,
        ($Payload | ConvertTo-Json -Compress -Depth 12),
        $utf8
    )
    try {
        $metadataRaw = @(
            Invoke-AwsCli -Arguments @(
                'lambda', 'invoke',
                '--function-name', $FunctionName,
                '--cli-binary-format', 'raw-in-base64-out',
                '--payload', "file://$inputPath",
                '--log-type', 'None',
                $outputPath
            )
        )
        $metadata = ($metadataRaw -join "`n") | ConvertFrom-Json
        if ([int]$metadata.StatusCode -ne 200 -or
            $null -ne $metadata.PSObject.Properties['FunctionError']) {
            throw 'Admin command Lambda returned an invocation error'
        }
        $responseText = [System.IO.File]::ReadAllText($outputPath, $utf8)
        if ([string]::IsNullOrWhiteSpace($responseText)) {
            throw 'Admin command Lambda returned an empty payload'
        }
        return ($responseText | ConvertFrom-Json)
    }
    finally {
        Remove-Item -LiteralPath $inputPath -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $outputPath -Force -ErrorAction SilentlyContinue
    }
}

function Get-GeneratedSchedules {
    param(
        [Parameter(Mandatory)][string]$GroupName,
        [string[]]$SessionIds,
        [string[]]$ItemIds
    )

    if (@($SessionIds).Count -eq 0 -and @($ItemIds).Count -eq 0) {
        return @()
    }
    $schedules = New-Object System.Collections.Generic.List[object]
    $nextToken = $null
    do {
        $arguments = @(
            'scheduler', 'list-schedules',
            '--group-name', $GroupName,
            '--max-results', '100'
        )
        if (-not [string]::IsNullOrWhiteSpace($nextToken)) {
            $arguments += @('--next-token', $nextToken)
        }
        $response = Invoke-AwsJson -Arguments $arguments
        foreach ($schedule in @(Get-OptionalCollection $response 'Schedules')) {
            $name = [string]$schedule.Name
            if ($name -eq 'lifecycle-watchdog') {
                continue
            }
            $isGenerated = $false
            foreach ($sessionId in @($SessionIds)) {
                if (-not [string]::IsNullOrWhiteSpace($sessionId) -and
                    $name -eq "start-session-$sessionId") {
                    $isGenerated = $true
                    break
                }
            }
            if (-not $isGenerated) {
                foreach ($itemId in @($ItemIds)) {
                    if (-not [string]::IsNullOrWhiteSpace($itemId) -and
                        $name -match ('^close-item-' + [regex]::Escape($itemId) + '-[0-9]+$')) {
                        $isGenerated = $true
                        break
                    }
                }
            }
            if ($isGenerated) {
                $schedules.Add($schedule)
            }
        }
        $nextToken = [string](Get-OptionalProperty $response 'NextToken')
    } while (-not [string]::IsNullOrWhiteSpace($nextToken))
    return $schedules.ToArray()
}

function Remove-GeneratedSchedules {
    param(
        [Parameter(Mandatory)][string]$GroupName,
        [string[]]$SessionIds,
        [string[]]$ItemIds
    )

    foreach ($schedule in @(Get-GeneratedSchedules -GroupName $GroupName `
        -SessionIds $SessionIds -ItemIds $ItemIds)) {
        Invoke-AwsJson -Arguments @(
            'scheduler', 'delete-schedule',
            '--group-name', $GroupName,
            '--name', [string]$schedule.Name
        ) | Out-Null
    }
}

function Remove-MediaVersions {
    param(
        [Parameter(Mandatory)][string]$BucketName,
        [Parameter(Mandatory)][string]$SellerSub
    )

    $prefix = "items/$SellerSub/"
    $objects = New-Object System.Collections.Generic.List[object]
    $keyMarker = $null
    $versionMarker = $null
    do {
        $arguments = @(
            's3api', 'list-object-versions',
            '--bucket', $BucketName,
            '--prefix', $prefix
        )
        if (-not [string]::IsNullOrWhiteSpace($keyMarker)) {
            $arguments += @('--key-marker', $keyMarker)
        }
        if (-not [string]::IsNullOrWhiteSpace($versionMarker)) {
            $arguments += @('--version-id-marker', $versionMarker)
        }
        $response = Invoke-AwsJson -Arguments $arguments
        foreach ($version in @(Get-OptionalCollection $response 'Versions')) {
            $objects.Add(@{
                Key       = [string]$version.Key
                VersionId = [string]$version.VersionId
            })
        }
        foreach ($marker in @(Get-OptionalCollection $response 'DeleteMarkers')) {
            $objects.Add(@{
                Key       = [string]$marker.Key
                VersionId = [string]$marker.VersionId
            })
        }
        $keyMarker = [string](Get-OptionalProperty $response 'NextKeyMarker')
        $versionMarker = [string](Get-OptionalProperty $response 'NextVersionIdMarker')
        $isTruncated = (Get-OptionalProperty $response 'IsTruncated') -eq $true
    } while ($isTruncated)

    for ($offset = 0; $offset -lt $objects.Count; $offset += 1000) {
        $count = [Math]::Min(1000, $objects.Count - $offset)
        $chunk = $objects.GetRange($offset, $count)
        $pending = New-Object System.Collections.Generic.List[object]
        foreach ($candidate in $chunk.ToArray()) {
            $candidateKey = [string]$candidate.Key
            $candidateVersionId = [string]$candidate.VersionId
            if ([string]::IsNullOrWhiteSpace($candidateKey) -or
                -not $candidateKey.StartsWith(
                    $prefix, [System.StringComparison]::Ordinal
                ) -or
                [string]::IsNullOrWhiteSpace($candidateVersionId)) {
                throw 'Media version cleanup received an invalid listing response'
            }
            $pending.Add(@{
                Key       = $candidateKey
                VersionId = $candidateVersionId
            })
        }

        $deleteAttempt = 0
        $maxDeleteAttempts = 5
        $deleteDeadline = [DateTimeOffset]::UtcNow.AddSeconds(60)
        $deleteBackoff = 1
        while ($pending.Count -gt 0) {
            $deleteAttempt++
            $requestedObjects = $pending.ToArray()
            $pending.Clear()
            $deleteResponse = Invoke-AwsJsonPayload `
                -Arguments @('s3api', 'delete-objects') -Payload @{
                    Bucket = $BucketName
                    Delete = @{
                        Objects = $requestedObjects
                        Quiet   = $true
                    }
                }
            $deleteErrors = @(
                Get-OptionalCollection $deleteResponse 'Errors'
            )
            $failedObjects = New-Object System.Collections.Generic.List[object]
            foreach ($deleteError in $deleteErrors) {
                $failedKey = [string](Get-OptionalProperty $deleteError 'Key')
                $failedVersionId = [string](
                    Get-OptionalProperty $deleteError 'VersionId'
                )
                $matchingRequests = @($requestedObjects | Where-Object {
                    [string]$_.Key -ceq $failedKey -and
                    [string]$_.VersionId -ceq $failedVersionId
                })
                $duplicateFailures = @($failedObjects.ToArray() | Where-Object {
                    [string]$_.Key -ceq $failedKey -and
                    [string]$_.VersionId -ceq $failedVersionId
                })
                if ($matchingRequests.Count -ne 1 -or
                    $duplicateFailures.Count -ne 0) {
                    throw 'Media version cleanup received an invalid delete response'
                }
                $failedObjects.Add(@{
                    Key       = $failedKey
                    VersionId = $failedVersionId
                })
            }

            if ($failedObjects.Count -eq 0) {
                continue
            }
            if ($deleteAttempt -ge $maxDeleteAttempts -or
                [DateTimeOffset]::UtcNow -ge $deleteDeadline) {
                throw 'Media version cleanup retained failed objects'
            }
            foreach ($failedObject in $failedObjects.ToArray()) {
                $pending.Add(@{
                    Key       = [string]$failedObject.Key
                    VersionId = [string]$failedObject.VersionId
                })
            }
            Start-Sleep -Seconds $deleteBackoff
            $deleteBackoff = [Math]::Min($deleteBackoff + 1, 5)
        }
    }
}

function Invoke-CleanupStep {
    param(
        [Parameter(Mandatory)][string]$Description,
        [Parameter(Mandatory)][scriptblock]$Action,
        [Parameter(Mandatory)]
        [AllowEmptyCollection()]
        [System.Collections.Generic.List[string]]$Errors
    )

    try {
        & $Action
    }
    catch {
        $Errors.Add($Description)
    }
}

function Get-CatalogKey {
    param($Item)

    return @{
        pk = @{ S = Get-DynamoString $Item 'pk' }
        sk = @{ S = Get-DynamoString $Item 'sk' }
    }
}

function Get-EventKey {
    param($Item)

    return @{
        item_id = @{ S = Get-DynamoString $Item 'item_id' }
        sk      = @{ S = Get-DynamoString $Item 'sk' }
    }
}

function Assert-LifecycleEvents {
    param(
        [Parameter(Mandatory)][string]$EventsTable,
        [Parameter(Mandatory)][string]$ItemId,
        [Parameter(Mandatory)][string]$SessionId,
        [Parameter(Mandatory)][string[]]$EventTypes
    )

    $events = @(Get-DynamoPartitionItems -TableName $EventsTable `
        -PartitionKeyName 'item_id' -PartitionValue $ItemId)
    foreach ($eventType in $EventTypes) {
        $matches = @($events | Where-Object {
            (Get-DynamoString $_ 'event_type') -eq $eventType -and
            (Get-DynamoString $_ 'session_id') -eq $SessionId -and
            (Get-DynamoString $_ 'item_id') -eq $ItemId
        })
        if ($matches.Count -ne 1) {
            throw "Lifecycle event $eventType is missing or duplicated"
        }
    }
}

function Invoke-Stage4LiveE2E {
    param(
        [Parameter(Mandatory)][string]$BaseUrl,
        [Parameter(Mandatory)][string]$ItemId,
        [Parameter(Mandatory)][string]$BidderAUsername,
        [Parameter(Mandatory)][string]$BidderAPassword,
        [Parameter(Mandatory)][string]$BidderBUsername,
        [Parameter(Mandatory)][string]$BidderBPassword
    )

    Assert-CallerGatePassed
    if ($BaseUrl -notmatch '^https://[a-z0-9]+\.cloudfront\.net$') {
        throw 'Stage 4 frontend origin is invalid'
    }
    if ($ItemId -notmatch '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$') {
        throw 'Stage 4 live item identifier is invalid'
    }

    $runtimeValues = @{
        LIVE_AUCTION_E2E                      = '1'
        LIVE_AUCTION_E2E_BASE_URL             = $BaseUrl
        LIVE_AUCTION_E2E_ITEM_ID              = $ItemId
        LIVE_AUCTION_E2E_BIDDER_A_USERNAME    = $BidderAUsername
        LIVE_AUCTION_E2E_BIDDER_A_PASSWORD    = $BidderAPassword
        LIVE_AUCTION_E2E_BIDDER_B_USERNAME    = $BidderBUsername
        LIVE_AUCTION_E2E_BIDDER_B_PASSWORD    = $BidderBPassword
        LIVE_AUCTION_E2E_ACCEPTED_BID_AMOUNT  = '210'
        LIVE_AUCTION_E2E_REJECTED_BID_AMOUNT  = '200'
        LIVE_AUCTION_E2E_EXTENSION_BID_AMOUNT = '205'
    }
    $previousValues = @{}
    $locationPushed = $false
    try {
        foreach ($name in $runtimeValues.Keys) {
            $previousValues[$name] = [Environment]::GetEnvironmentVariable(
                $name,
                [EnvironmentVariableTarget]::Process
            )
            [Environment]::SetEnvironmentVariable(
                $name,
                $runtimeValues[$name],
                [EnvironmentVariableTarget]::Process
            )
        }

        Push-Location (Join-Path $repoRoot 'frontend')
        $locationPushed = $true
        & npm run test:e2e:live
        if ($LASTEXITCODE -ne 0) {
            throw 'Live browser checkpoint failed'
        }
    }
    finally {
        if ($locationPushed) {
            Pop-Location
        }
        foreach ($name in $runtimeValues.Keys) {
            [Environment]::SetEnvironmentVariable(
                $name,
                $previousValues[$name],
                [EnvironmentVariableTarget]::Process
            )
        }
    }
}

if ($Profile -ne 'la-admin' -or $Region -ne 'ap-southeast-1') {
    throw 'Integration is pinned to profile la-admin and region ap-southeast-1'
}
$caller = Invoke-AwsJson -Arguments @('sts', 'get-caller-identity') `
    -AllowCallerProbe
if ($caller.Arn -match ':root$' -or
    [string]$caller.Account -ne '233376973052' -or
    [string]$caller.Arn -ne 'arn:aws:iam::233376973052:user/la-admin') {
    throw 'Caller gate failed: exact la-admin IAM user is required'
}
$script:CallerGatePassed = $true
Initialize-TerraformCredentials

$poolId = $null
$clientId = $null
$restUrl = $null
$apiKeyId = $null
$apiKeyValue = $null
$catalogTable = $null
$categoryTable = $null
$auditTable = $null
$stateTable = $null
$eventsTable = $null
$connectionsTable = $null
$aliasesTable = $null
$commandQueueUrl = $null
$commandDlqUrl = $null
$schedulerDlqUrl = $null
$schedulerGroup = $null
$adminFunction = $null
$mediaBucket = $null
$sellerSub = $null
$bidderSub = $null
$bidderBSub = $null
$adminSub = $null
$bootstrapSub = $null
$bootstrapToken = $null
$createdAdminAccountUsername = $null
$sellerToken = $null
$bidderToken = $null
$adminToken = $null
$sessionId = $null
$categoryId = $null
$item1Id = $null
$item2Id = $null
$item1End = $null
$oldExpectedEnd = $null
$newExpectedEnd = $null
$mainError = $null
$cleanupErrors = New-Object System.Collections.Generic.List[string]
$createdUsers = New-Object System.Collections.Generic.List[string]
$catalogFixtureItems = New-Object System.Collections.Generic.List[object]
$cleanupItemIds = New-Object System.Collections.Generic.List[string]
$cleanupSessionIds = New-Object System.Collections.Generic.List[string]

$runId = [DateTimeOffset]::UtcNow.ToString('yyyyMMddHHmmssfff') + '-' +
    [Guid]::NewGuid().ToString('N').Substring(0, 8)
$invalidFixtureTitle = "stage3-$runId-invalid-token"
$sellerUsername = "stage3-$runId-seller@example.invalid"
$bidderUsername = "stage3-$runId-bidder@example.invalid"
$bidderBUsername = "stage3-$runId-bidder-b@example.invalid"
$adminUsername = "stage4-$runId-admin@example.invalid"
$temporaryAdminUsername = "stage4-$runId-temporary-admin@example.invalid"
$item2DurationSeconds = if ($RunStage4LiveE2E) { 300 } else { 60 }
$sellerPassword = New-TemporaryPassword
$bidderPassword = New-TemporaryPassword
$bidderBPassword = if ($RunStage4LiveE2E) { New-TemporaryPassword } else { $null }
$adminPassword = if ($RunStage4AdminLiveCheckpoint) { New-TemporaryPassword } else { $null }
$temporaryAdminPassword = if ($RunStage4AdminLiveCheckpoint) { New-TemporaryPassword } else { $null }

try {
    $poolId = Get-TerraformOutput 'infra/03-identity' 'cognito_user_pool_id'
    $clientId = Get-TerraformOutput 'infra/03-identity' 'cognito_user_pool_client_id'
    $catalogTable = Get-TerraformOutput 'infra/04-data' 'auction_catalog_table_name'
    $categoryTable = Get-TerraformOutput 'infra/04-data' 'category_catalog_table_name'
    $auditTable = Get-TerraformOutput 'infra/04-data' 'admin_audit_events_table_name'
    $stateTable = Get-TerraformOutput 'infra/04-data' 'item_state_table_name'
    $eventsTable = Get-TerraformOutput 'infra/04-data' 'bid_events_table_name'
    $connectionsTable = Get-TerraformOutput 'infra/04-data' 'websocket_connections_table_name'
    $aliasesTable = Get-TerraformOutput 'infra/04-data' 'bidder_aliases_table_name'
    $mediaBucket = Get-TerraformOutput 'infra/04-data' 'media_bucket_name'
    $commandQueueUrl = Get-TerraformOutput 'infra/05-messaging' 'bid_commands_queue_url'
    $commandDlqUrl = Get-TerraformOutput 'infra/05-messaging' 'bid_commands_dlq_url'
    $schedulerGroup = Get-TerraformOutput 'infra/05-messaging' 'scheduler_group_name'
    $schedulerDlqUrl = Get-TerraformOutput 'infra/05-messaging' 'scheduler_dlq_url'
    $stage3Functions = Get-TerraformOutput 'infra/06-compute/stage3-control-plane' 'stage3_functions' -Json
    $adminFunction = [string]$stage3Functions.admin_command.name
    if ([string]::IsNullOrWhiteSpace($adminFunction)) {
        throw 'Admin command Terraform output is missing'
    }
    $restUrl = Get-TerraformOutput 'infra/07-api' 'stage3_rest_invoke_url'
    $apiKeyId = Get-TerraformOutput 'infra/07-api' 'stage3_rest_api_key_id'
    $frontendOrigin = if ($RunStage4LiveE2E) {
        Get-TerraformOutput 'infra/09-edge' 'cloudfront_origin'
    }
    $script:TerraformCredentials = $null

    $queueBaseline = Get-QueueCount $commandQueueUrl
    $commandDlqBaseline = Get-QueueCount $commandDlqUrl
    $schedulerDlqBaseline = Get-QueueCount $schedulerDlqUrl
    if ($queueBaseline -ne 0 -or
        $commandDlqBaseline -ne 0 -or
        $schedulerDlqBaseline -ne 0) {
        throw 'Queue health gate requires three empty queues'
    }

    $apiKeyResponse = Invoke-AwsJson -Arguments @(
        'apigateway', 'get-api-key',
        '--api-key', $apiKeyId,
        '--include-value'
    )
    $apiKeyValue = [string]$apiKeyResponse.value
    $apiKeyResponse = $null
    if ([string]::IsNullOrWhiteSpace($apiKeyValue)) {
        throw 'REST API key value is unavailable'
    }

    $invalid = Invoke-RestJson -Method 'POST' -BaseUrl $restUrl `
        -Path '/api/v1/auction-sessions' -ApiKey $apiKeyValue `
        -IdToken 'clearly-invalid-stage3-token' -Body @{
            title       = $invalidFixtureTitle
            description = 'Invalid token mutation probe'
        }
    $invalidData = Get-OptionalProperty $invalid.Body 'data'
    $invalidSessionId = [string](
        Get-OptionalProperty $invalidData 'session_id'
    )
    if (-not [string]::IsNullOrWhiteSpace($invalidSessionId)) {
        if (-not $cleanupSessionIds.Contains($invalidSessionId)) {
            $cleanupSessionIds.Add($invalidSessionId)
        }
        throw 'Invalid token request returned a catalog session'
    }
    if ($invalid.StatusCode -ne 401) {
        throw 'Invalid token was not denied'
    }
    Write-Output 'invalid token: denied'

    New-CognitoFixtureUser -PoolId $poolId -Username $sellerUsername `
        -Password $sellerPassword -Group 'USER' -CreatedUsers $createdUsers
    New-CognitoFixtureUser -PoolId $poolId -Username $bidderUsername `
        -Password $bidderPassword -Group 'USER' -CreatedUsers $createdUsers
    if ($RunStage4LiveE2E) {
        New-CognitoFixtureUser -PoolId $poolId -Username $bidderBUsername `
            -Password $bidderBPassword -Group 'USER' -CreatedUsers $createdUsers
    }
    if ($RunStage4AdminLiveCheckpoint) {
        New-CognitoFixtureUser -PoolId $poolId -Username $adminUsername `
            -Password $adminPassword -Group 'ADMIN' -CreatedUsers $createdUsers
        New-CognitoFixtureUser -PoolId $poolId -Username $temporaryAdminUsername `
            -Password $temporaryAdminPassword -Group 'ADMIN' -CreatedUsers $createdUsers `
            -Temporary
    }
    $sellerIdentity = Get-CognitoIdentity -PoolId $poolId -ClientId $clientId `
        -Username $sellerUsername -Password $sellerPassword
    $bidderIdentity = Get-CognitoIdentity -PoolId $poolId -ClientId $clientId `
        -Username $bidderUsername -Password $bidderPassword
    $sellerSub = [string]$sellerIdentity.Sub
    $sellerToken = [string]$sellerIdentity.IdToken
    $bidderSub = [string]$bidderIdentity.Sub
    $bidderToken = [string]$bidderIdentity.IdToken
    if ($RunStage4LiveE2E) {
        $bidderBIdentity = Get-CognitoIdentity -PoolId $poolId -ClientId $clientId `
            -Username $bidderBUsername -Password $bidderBPassword
        $bidderBSub = [string]$bidderBIdentity.Sub
        $bidderBIdentity = $null
    }
    if ($RunStage4AdminLiveCheckpoint) {
        $adminIdentity = Get-CognitoIdentity -PoolId $poolId -ClientId $clientId `
            -Username $adminUsername -Password $adminPassword
        $adminSub = [string]$adminIdentity.Sub
        $adminToken = [string]$adminIdentity.IdToken
        $adminIdentity = $null
        $temporaryAdminIdentity = Get-CognitoIdentity -PoolId $poolId -ClientId $clientId `
            -Username $temporaryAdminUsername -Password $temporaryAdminPassword
        if ([string]::IsNullOrWhiteSpace([string]$temporaryAdminIdentity.IdToken)) {
            throw 'Temporary Admin password completion did not return an ID token'
        }
        $temporaryAdminIdentity = $null
    }
    if (-not [string]::IsNullOrWhiteSpace($BootstrapAdminUsername)) {
        $bootstrapPassword = [Environment]::GetEnvironmentVariable(
            $BootstrapAdminPasswordEnvironmentVariable
        )
        if ([string]::IsNullOrWhiteSpace($bootstrapPassword)) {
            $bootstrapPassword = Read-Host -Prompt 'Bootstrap Admin password'
        }
        if ([string]::IsNullOrWhiteSpace($bootstrapPassword)) {
            throw "Bootstrap Admin password environment variable is empty: $BootstrapAdminPasswordEnvironmentVariable"
        }
        $bootstrapIdentity = Get-CognitoIdentity -PoolId $poolId -ClientId $clientId `
            -Username $BootstrapAdminUsername -Password $bootstrapPassword
        $bootstrapSub = [string]$bootstrapIdentity.Sub
        $bootstrapToken = [string]$bootstrapIdentity.IdToken
        $bootstrapIdentity = $null
        $bootstrapPassword = $null
    }
    $sellerIdentity = $null
    $bidderIdentity = $null

    $userSessionResponse = Invoke-RestJson -Method 'POST' -BaseUrl $restUrl `
        -Path '/api/v1/auction-sessions' -ApiKey $apiKeyValue `
        -IdToken $bidderToken -Body @{
            title       = "stage3-$runId-user-session"
            description = 'USER session creation probe'
        }
    $userSessionData = Get-OptionalProperty $userSessionResponse.Body 'data'
    $userSessionId = [string](
        Get-OptionalProperty $userSessionData 'session_id'
    )
    if (-not [string]::IsNullOrWhiteSpace($userSessionId)) {
        if (-not $cleanupSessionIds.Contains($userSessionId)) {
            $cleanupSessionIds.Add($userSessionId)
        }
    }
    $userSessionData = Assert-RestEnvelope -Response $userSessionResponse `
        -StatusCode 201 -Code 'SESSION_CREATED' `
        -DataProperties @('session_id', 'status')
    if ([string]$userSessionData.status -ne 'DRAFT' -or
        [string]$userSessionData.session_id -ne $userSessionId) {
        throw 'USER session creation result is inconsistent'
    }

    $sessionResponse = Invoke-RestJson -Method 'POST' -BaseUrl $restUrl `
        -Path '/api/v1/auction-sessions' -ApiKey $apiKeyValue `
        -IdToken $sellerToken -Body @{
            title       = "stage3-$runId"
            description = 'Stage 3 lifecycle integration fixture'
        }
    $provisionalSessionData = Get-OptionalProperty $sessionResponse.Body 'data'
    $provisionalSessionId = [string](
        Get-OptionalProperty $provisionalSessionData 'session_id'
    )
    if (-not [string]::IsNullOrWhiteSpace($provisionalSessionId)) {
        $sessionId = $provisionalSessionId
        if (-not $cleanupSessionIds.Contains($provisionalSessionId)) {
            $cleanupSessionIds.Add($provisionalSessionId)
        }
    }
    $sessionData = Assert-RestEnvelope -Response $sessionResponse `
        -StatusCode 201 -Code 'SESSION_CREATED' `
        -DataProperties @('session_id', 'status')
    if ([string]$sessionData.status -ne 'DRAFT' -or
        [string]::IsNullOrWhiteSpace([string]$sessionData.session_id)) {
        throw 'Created session response is invalid'
    }
    $sessionId = [string]$sessionData.session_id
    if (-not $cleanupSessionIds.Contains($sessionId)) {
        $cleanupSessionIds.Add($sessionId)
    }

    $rulesResponse = Invoke-RestJson -Method 'PUT' -BaseUrl $restUrl `
        -Path "/api/v1/auction-sessions/$sessionId/rules" `
        -ApiKey $apiKeyValue -IdToken $sellerToken -Body @{
            min_increment       = '5'
            max_increment       = '500'
            anti_snipe_window_s = 30
            anti_snipe_extend_s = 60
            max_extensions      = 10
            public_history_limit = 20
        }
    $rulesData = Assert-RestEnvelope -Response $rulesResponse `
        -StatusCode 200 -Code 'SESSION_RULES_UPDATED' `
        -DataProperties @('session_id', 'version')
    if ([string]$rulesData.session_id -ne $sessionId -or
        [int]$rulesData.version -ne 2) {
        throw 'Rules response has unexpected identity or version'
    }

    $item1Response = Invoke-RestJson -Method 'POST' -BaseUrl $restUrl `
        -Path "/api/v1/auction-sessions/$sessionId/items" `
        -ApiKey $apiKeyValue -IdToken $sellerToken -Body @{
            name            = "stage3-$runId-item-one"
            description     = 'First lifecycle fixture'
            sequence_number = 1
            start_price     = '100'
            duration_s      = 60
        }
    $provisionalItem1Data = Get-OptionalProperty $item1Response.Body 'data'
    $provisionalItem1Id = [string](
        Get-OptionalProperty $provisionalItem1Data 'item_id'
    )
    if (-not [string]::IsNullOrWhiteSpace($provisionalItem1Id)) {
        $item1Id = $provisionalItem1Id
    }
    $item1Data = Assert-RestEnvelope -Response $item1Response `
        -StatusCode 201 -Code 'ITEM_CREATED' `
        -DataProperties @('item_id', 'status', 'version')
    if ([string]$item1Data.status -ne 'WAITING' -or
        [int]$item1Data.version -ne 1) {
        throw 'Item one response has unexpected status or version'
    }
    $item1Id = [string]$item1Data.item_id

    $item2Response = Invoke-RestJson -Method 'POST' -BaseUrl $restUrl `
        -Path "/api/v1/auction-sessions/$sessionId/items" `
        -ApiKey $apiKeyValue -IdToken $sellerToken -Body @{
            name            = "stage3-$runId-item-two"
            description     = 'Second lifecycle fixture'
            sequence_number = 2
            start_price     = '200'
            duration_s      = $item2DurationSeconds
        }
    $provisionalItem2Data = Get-OptionalProperty $item2Response.Body 'data'
    $provisionalItem2Id = [string](
        Get-OptionalProperty $provisionalItem2Data 'item_id'
    )
    if (-not [string]::IsNullOrWhiteSpace($provisionalItem2Id)) {
        $item2Id = $provisionalItem2Id
    }
    $item2Data = Assert-RestEnvelope -Response $item2Response `
        -StatusCode 201 -Code 'ITEM_CREATED' `
        -DataProperties @('item_id', 'status', 'version')
    if ([string]$item2Data.status -ne 'WAITING' -or
        [int]$item2Data.version -ne 1) {
        throw 'Item two response has unexpected status or version'
    }
    $item2Id = [string]$item2Data.item_id

    $nowEpoch = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    $scheduledStart = [long]([Math]::Ceiling(($nowEpoch + 120) / 60.0) * 60)
    if (($scheduledStart % 60) -ne 0 -or $scheduledStart -lt ($nowEpoch + 120)) {
        throw 'Scheduler start time is not safely minute-aligned'
    }
    $scheduleResponse = Invoke-RestJson -Method 'POST' -BaseUrl $restUrl `
        -Path "/api/v1/auction-sessions/$sessionId/schedule" `
        -ApiKey $apiKeyValue -IdToken $sellerToken -Body @{
            start_time = $scheduledStart
        }
    $scheduleData = Assert-RestEnvelope -Response $scheduleResponse `
        -StatusCode 200 -Code 'SESSION_SCHEDULED' `
        -DataProperties @('session_id', 'status', 'start_time')
    if ([string]$scheduleData.session_id -ne $sessionId -or
        [string]$scheduleData.status -ne 'SCHEDULED' -or
        [long]$scheduleData.start_time -ne $scheduledStart) {
        throw 'Schedule response is inconsistent'
    }
    $startSchedule = Invoke-AwsJson -Arguments @(
        'scheduler', 'get-schedule',
        '--group-name', $schedulerGroup,
        '--name', "start-session-$sessionId"
    )
    $startPayload = [string]$startSchedule.Target.Input | ConvertFrom-Json
    Assert-ExactProperties -Value $startPayload `
        -Names @('command', 'session_id') -Description 'Start schedule payload'
    if ([string]$startPayload.command -ne 'START_SESSION' -or
        [string]$startPayload.session_id -ne $sessionId -or
        [string]$startSchedule.ScheduleExpressionTimezone -ne 'UTC') {
        throw 'Start schedule target is inconsistent'
    }
    Write-Output 'seller control plane: created'

    $item1State = Wait-Until -Description 'item one LIVE state' -Condition {
        $state = Get-DynamoItem -TableName $stateTable -Key @{
            item_id = @{ S = $item1Id }
        }
        if ((Get-DynamoString $state 'status') -eq 'LIVE' -and
            (Get-DynamoString $state 'item_id') -eq $item1Id -and
            (Get-DynamoString $state 'session_id') -eq $sessionId -and
            (Get-DynamoNumber $state 'version') -eq 1) {
            return $state
        }
        return $null
    }
    $item1Catalog = Get-DynamoItem -TableName $catalogTable -Key @{
        pk = @{ S = "SESSION#$sessionId" }
        sk = @{ S = "ITEM#000001#$item1Id" }
    }
    if ((Get-DynamoString $item1Catalog 'status') -ne 'LIVE' -or
        (Get-DynamoNumber $item1Catalog 'version') -ne 2) {
        throw 'Item one catalog LIVE version is inconsistent'
    }
    $item1End = Get-DynamoNumber $item1State 'end_time'
    Assert-LifecycleEvents -EventsTable $eventsTable -ItemId $item1Id `
        -SessionId $sessionId -EventTypes @('ITEM_OPENED')
    Write-Output 'item one: LIVE'

    $item1ClosedState = Wait-Until -Description 'item one UNSOLD state' -Condition {
        $state = Get-DynamoItem -TableName $stateTable -Key @{
            item_id = @{ S = $item1Id }
        }
        if ((Get-DynamoString $state 'status') -eq 'UNSOLD' -and
            (Get-DynamoString $state 'item_id') -eq $item1Id -and
            (Get-DynamoString $state 'session_id') -eq $sessionId -and
            (Get-DynamoNumber $state 'version') -eq 2) {
            return $state
        }
        return $null
    }
    $item1Catalog = Get-DynamoItem -TableName $catalogTable -Key @{
        pk = @{ S = "SESSION#$sessionId" }
        sk = @{ S = "ITEM#000001#$item1Id" }
    }
    if ((Get-DynamoString $item1Catalog 'status') -ne 'UNSOLD' -or
        (Get-DynamoNumber $item1Catalog 'version') -ne 3) {
        throw 'Item one catalog terminal version is inconsistent'
    }
    Assert-LifecycleEvents -EventsTable $eventsTable -ItemId $item1Id `
        -SessionId $sessionId -EventTypes @('ITEM_OPENED', 'ITEM_CLOSED')
    Write-Output 'item one: UNSOLD'

    $item2State = Wait-Until -Description 'item two LIVE state' -Condition {
        $state = Get-DynamoItem -TableName $stateTable -Key @{
            item_id = @{ S = $item2Id }
        }
        if ((Get-DynamoString $state 'status') -eq 'LIVE' -and
            (Get-DynamoString $state 'item_id') -eq $item2Id -and
            (Get-DynamoString $state 'session_id') -eq $sessionId -and
            (Get-DynamoNumber $state 'version') -eq 1) {
            return $state
        }
        return $null
    }
    $item2Catalog = Get-DynamoItem -TableName $catalogTable -Key @{
        pk = @{ S = "SESSION#$sessionId" }
        sk = @{ S = "ITEM#000002#$item2Id" }
    }
    $sessionCatalog = Get-DynamoItem -TableName $catalogTable -Key @{
        pk = @{ S = "SESSION#$sessionId" }
        sk = @{ S = 'META' }
    }
    if ((Get-DynamoString $item2Catalog 'status') -ne 'LIVE' -or
        (Get-DynamoNumber $item2Catalog 'version') -ne 2 -or
        (Get-DynamoString $sessionCatalog 'status') -ne 'LIVE' -or
        (Get-DynamoString $sessionCatalog 'active_item_id') -ne $item2Id -or
        (Get-DynamoNumber $sessionCatalog 'version') -ne 7) {
        throw 'Item two or session LIVE version is inconsistent'
    }
    Assert-LifecycleEvents -EventsTable $eventsTable -ItemId $item2Id `
        -SessionId $sessionId -EventTypes @('ITEM_OPENED')
    Write-Output 'item two: LIVE'

    if ($RunStage4LiveE2E) {
        $expectedBrowserStateEnd = Get-DynamoNumber $item2State 'end_time'
        $expectedBrowserStateVersion = Get-DynamoNumber $item2State 'version'
        $browserEndTime = [DateTimeOffset]::UtcNow.AddSeconds(75).ToUnixTimeSeconds()
        if ($browserEndTime -ge $expectedBrowserStateEnd) {
            throw 'Stage 4 browser window does not shorten the long-lived fixture'
        }
        $preparedBrowserState = Invoke-AwsJsonPayload -Arguments @(
            'dynamodb', 'update-item'
        ) -Payload @{
            TableName                 = $stateTable
            Key                       = @{ item_id = @{ S = $item2Id } }
            UpdateExpression          = 'SET end_time = :browser_end, version = version + :one'
            ConditionExpression       = '#status = :live AND end_time = :expected_end AND version = :expected_version'
            ExpressionAttributeNames  = @{ '#status' = 'status' }
            ExpressionAttributeValues = @{
                ':browser_end'      = @{ N = [string]$browserEndTime }
                ':one'              = @{ N = '1' }
                ':live'             = @{ S = 'LIVE' }
                ':expected_end'     = @{ N = [string]$expectedBrowserStateEnd }
                ':expected_version' = @{ N = [string]$expectedBrowserStateVersion }
            }
            ReturnValues              = 'ALL_NEW'
        }
        if ((Get-DynamoString $preparedBrowserState.Attributes 'status') -ne 'LIVE' -or
            (Get-DynamoNumber $preparedBrowserState.Attributes 'end_time') -ne $browserEndTime -or
            (Get-DynamoNumber $preparedBrowserState.Attributes 'version') -ne
                ($expectedBrowserStateVersion + 1)) {
            throw 'Stage 4 browser window state is inconsistent'
        }
        $item2State = $preparedBrowserState.Attributes
        Write-Output 'stage4 browser window: prepared'

        Invoke-Stage4LiveE2E -BaseUrl $frontendOrigin -ItemId $item2Id `
            -BidderAUsername $bidderUsername -BidderAPassword $bidderPassword `
            -BidderBUsername $bidderBUsername -BidderBPassword $bidderBPassword
        Write-Output 'stage4 live browser: passed'
    }
    else {
        $oldExpectedEnd = Get-DynamoNumber $item2State 'end_time'
        $newExpectedEnd = $oldExpectedEnd + 120
        $extension = Invoke-AwsJsonPayload -Arguments @(
        'dynamodb', 'update-item'
        ) -Payload @{
        TableName                 = $stateTable
        Key                       = @{ item_id = @{ S = $item2Id } }
        UpdateExpression          = 'SET end_time = :new_end, version = version + :one'
        ConditionExpression       = '#status = :live AND end_time = :old_end AND version = :expected_version'
        ExpressionAttributeNames  = @{ '#status' = 'status' }
        ExpressionAttributeValues = @{
            ':new_end'          = @{ N = [string]$newExpectedEnd }
            ':one'              = @{ N = '1' }
            ':live'             = @{ S = 'LIVE' }
            ':old_end'          = @{ N = [string]$oldExpectedEnd }
            ':expected_version' = @{ N = '1' }
        }
        ReturnValues              = 'ALL_NEW'
    }
        if ((Get-DynamoString $extension.Attributes 'status') -ne 'LIVE' -or
        (Get-DynamoNumber $extension.Attributes 'end_time') -ne $newExpectedEnd -or
        (Get-DynamoNumber $extension.Attributes 'version') -ne 2) {
        throw 'Conditional anti-snipe extension is inconsistent'
    }

        $staleResult = Invoke-AdminCommand -FunctionName $adminFunction -Payload @{
        command            = 'CLOSE_ITEM'
        item_id            = $item2Id
        expected_end_epoch = $oldExpectedEnd
    }
        Assert-ExactProperties -Value $staleResult `
        -Names @('status', 'end_time') -Description 'Stale close result'
        if ([string]$staleResult.status -ne 'RESCHEDULED' -or
        [long]$staleResult.end_time -ne $newExpectedEnd) {
        throw 'Stale close did not return the exact RESCHEDULED result'
    }
        $preservedState = Get-DynamoItem -TableName $stateTable -Key @{
        item_id = @{ S = $item2Id }
    }
        if ((Get-DynamoString $preservedState 'status') -ne 'LIVE' -or
        (Get-DynamoNumber $preservedState 'end_time') -ne $newExpectedEnd -or
        (Get-DynamoNumber $preservedState 'version') -ne 2) {
        throw 'Stale close changed the preserved LIVE state'
    }
        $newScheduleName = "close-item-$item2Id-$newExpectedEnd"
        $newCloseSchedule = Invoke-AwsJson -Arguments @(
        'scheduler', 'get-schedule',
        '--group-name', $schedulerGroup,
        '--name', $newScheduleName
    )
        $newClosePayload = [string]$newCloseSchedule.Target.Input | ConvertFrom-Json
        Assert-ExactProperties -Value $newClosePayload `
        -Names @('command', 'item_id', 'expected_end_epoch') `
        -Description 'Rescheduled close payload'
        if ([string]$newClosePayload.command -ne 'CLOSE_ITEM' -or
        [string]$newClosePayload.item_id -ne $item2Id -or
        [long]$newClosePayload.expected_end_epoch -ne $newExpectedEnd -or
        [string]$newCloseSchedule.Name -ne "close-item-$item2Id-$newExpectedEnd") {
        throw 'Deterministic rescheduled close target is inconsistent'
    }
        Write-Output 'stale close: RESCHEDULED'
    }

    if ($RunStage4AdminLiveCheckpoint) {
        $dashboardResponse = Invoke-RestJson -Method 'GET' -BaseUrl $restUrl `
            -Path '/api/v1/admin/dashboard' -ApiKey $apiKeyValue `
            -IdToken $adminToken
        $dashboardData = Assert-RestEnvelope -Response $dashboardResponse `
            -StatusCode 200 -Code 'ADMIN_DASHBOARD_RETRIEVED' `
            -DataProperties @('session_counts', 'item_counts', 'recent_sessions', 'truncated')
        if ($null -eq $dashboardData.session_counts -or
            $null -eq $dashboardData.item_counts) {
            throw 'Admin dashboard counts are missing'
        }

        $adminSessionFields = @(
            'session_id', 'title', 'description', 'status', 'review_status',
            'item_count', 'seller_sub', 'version', 'created_at', 'updated_at'
        )
        $adminSessionsResponse = Invoke-RestJson -Method 'GET' -BaseUrl $restUrl `
            -Path '/api/v1/admin/auction-sessions?reviewStatus=PENDING&pageSize=100' `
            -ApiKey $apiKeyValue -IdToken $adminToken
        $adminSessionsData = Assert-RestEnvelope -Response $adminSessionsResponse `
            -StatusCode 200 -Code 'ADMIN_SESSIONS_LISTED' `
            -DataProperties @('items', 'next_token')
        if (-not @($adminSessionsData.items | Where-Object {
            [string]$_.session_id -eq $userSessionId
        })) {
            throw 'Admin session queue does not contain the USER fixture'
        }

        $adminSessionDetail = Invoke-RestJson -Method 'GET' -BaseUrl $restUrl `
            -Path "/api/v1/admin/auction-sessions/$userSessionId" `
            -ApiKey $apiKeyValue -IdToken $adminToken
        $adminSessionDetailData = Assert-RestEnvelope -Response $adminSessionDetail `
            -StatusCode 200 -Code 'ADMIN_SESSION_RETRIEVED' `
            -DataProperties @('session', 'items')
        Assert-ExactProperties -Value $adminSessionDetailData.session `
            -Names $adminSessionFields -Description 'Admin session detail'

        $approvedSession = Invoke-RestJson -Method 'POST' -BaseUrl $restUrl `
            -Path "/api/v1/admin/auction-sessions/$userSessionId/approve" `
            -ApiKey $apiKeyValue -IdToken $adminToken
        $approvedSessionData = Assert-RestEnvelope -Response $approvedSession `
            -StatusCode 200 -Code 'SESSION_APPROVED' `
            -DataProperties $adminSessionFields
        if ([string]$approvedSessionData.review_status -ne 'APPROVED' -or
            [string]$approvedSessionData.status -ne 'DRAFT') {
            throw 'Admin session approval result is inconsistent'
        }

        $cancelledSession = Invoke-RestJson -Method 'POST' -BaseUrl $restUrl `
            -Path "/api/v1/admin/auction-sessions/$userSessionId/cancel" `
            -ApiKey $apiKeyValue -IdToken $adminToken
        $cancelledSessionData = Assert-RestEnvelope -Response $cancelledSession `
            -StatusCode 200 -Code 'SESSION_CANCELLED' `
            -DataProperties $adminSessionFields
        if ([string]$cancelledSessionData.status -ne 'CANCELLED') {
            throw 'Admin session cancellation result is inconsistent'
        }
        Write-Output 'stage4 admin session: passed'

        $categoryName = "Stage4 $runId category"
        $categorySlug = "stage4-$runId-category"
        $categoryCreate = Invoke-RestJson -Method 'POST' -BaseUrl $restUrl `
            -Path '/api/v1/admin/categories' -ApiKey $apiKeyValue `
            -IdToken $adminToken -Body @{ name = $categoryName; slug = $categorySlug }
        $categoryFields = @('category_id', 'name', 'slug', 'status', 'created_at', 'updated_at')
        $categoryData = Assert-RestEnvelope -Response $categoryCreate `
            -StatusCode 201 -Code 'CATEGORY_CREATED' `
            -DataProperties $categoryFields
        $categoryId = [string]$categoryData.category_id
        if ([string]::IsNullOrWhiteSpace($categoryId)) {
            throw 'Category fixture did not return an ID'
        }

        $categoryUpdate = Invoke-RestJson -Method 'PATCH' -BaseUrl $restUrl `
            -Path "/api/v1/admin/categories/$categoryId" -ApiKey $apiKeyValue `
            -IdToken $adminToken -Body @{
                name = "$categoryName updated"
                slug = "${categorySlug}-updated"
            }
        $updatedCategory = Assert-RestEnvelope -Response $categoryUpdate `
            -StatusCode 200 -Code 'CATEGORY_UPDATED' `
            -DataProperties $categoryFields
        if ([string]$updatedCategory.status -ne 'ACTIVE' -or
            [string]$updatedCategory.slug -ne "${categorySlug}-updated") {
            throw 'Category update result is inconsistent'
        }

        $publicCategories = Invoke-RestJson -Method 'GET' -BaseUrl $restUrl `
            -Path '/api/v1/categories?pageSize=100' -ApiKey $apiKeyValue `
            -IdToken $bidderToken
        $publicCategoryData = Assert-RestEnvelope -Response $publicCategories `
            -StatusCode 200 -Code 'CATEGORIES_LISTED' `
            -DataProperties @('items', 'next_token')
        if (-not @($publicCategoryData.items | Where-Object {
            [string]$_.category_id -eq $categoryId -and [string]$_.status -eq 'ACTIVE'
        })) {
            throw 'Active category is missing from the public category list'
        }

        $categoryArchive = Invoke-RestJson -Method 'POST' -BaseUrl $restUrl `
            -Path "/api/v1/admin/categories/$categoryId/archive" -ApiKey $apiKeyValue `
            -IdToken $adminToken -Body @{}
        $archivedCategory = Assert-RestEnvelope -Response $categoryArchive `
            -StatusCode 200 -Code 'CATEGORY_ARCHIVED' `
            -DataProperties $categoryFields
        if ([string]$archivedCategory.status -ne 'INACTIVE') {
            throw 'Category archive did not set INACTIVE status'
        }

        $inactiveCategory = Invoke-RestJson -Method 'GET' -BaseUrl $restUrl `
            -Path "/api/v1/categories/$categoryId" -ApiKey $apiKeyValue `
            -IdToken $bidderToken
        if ($inactiveCategory.StatusCode -ne 404 -or
            [string]$inactiveCategory.Body.code -ne 'CATEGORY_NOT_FOUND') {
            throw 'Archived category remained publicly readable'
        }
        $adminInactiveCategories = Invoke-RestJson -Method 'GET' -BaseUrl $restUrl `
            -Path "/api/v1/admin/categories?status=INACTIVE&keyword=$([uri]::EscapeDataString("${categorySlug}-updated"))&pageSize=100" `
            -ApiKey $apiKeyValue -IdToken $adminToken
        $adminInactiveData = Assert-RestEnvelope -Response $adminInactiveCategories `
            -StatusCode 200 -Code 'ADMIN_CATEGORIES_LISTED' `
            -DataProperties @('items', 'next_token')
        if (-not @($adminInactiveData.items | Where-Object {
            [string]$_.category_id -eq $categoryId -and [string]$_.status -eq 'INACTIVE'
        })) {
            throw 'Admin inactive category filter did not return the fixture'
        }
        Write-Output 'stage4 admin category: passed'

        $adminUsers = Invoke-RestJson -Method 'GET' -BaseUrl $restUrl `
            -Path "/api/v1/admin/users?role=USER&keyword=$([uri]::EscapeDataString($bidderUsername))&pageSize=60" `
            -ApiKey $apiKeyValue -IdToken $adminToken
        $adminUsersData = Assert-RestEnvelope -Response $adminUsers `
            -StatusCode 200 -Code 'ADMIN_USERS_LISTED' `
            -DataProperties @('items', 'next_token')
        if (-not @($adminUsersData.items | Where-Object {
            [string]$_.sub -eq $bidderSub -and [string]$_.role -eq 'USER'
        })) {
            throw 'Admin user list does not contain the USER fixture'
        }

        $userStatusFields = @(
            'sub', 'email', 'full_name', 'phone', 'role', 'status', 'enabled',
            'cognito_status', 'is_primary_admin', 'created_at', 'updated_at'
        )
        $disabledUser = Invoke-RestJson -Method 'PATCH' -BaseUrl $restUrl `
            -Path "/api/v1/admin/users/$bidderSub/status" -ApiKey $apiKeyValue `
            -IdToken $adminToken -Body @{ status = 'BANNED' }
        $disabledUserData = Assert-RestEnvelope -Response $disabledUser `
            -StatusCode 200 -Code 'ADMIN_USER_STATUS_UPDATED' `
            -DataProperties $userStatusFields
        if ([string]$disabledUserData.status -ne 'BANNED' -or
            $disabledUserData.enabled -ne $false) {
            throw 'Admin USER disable result is inconsistent'
        }
        $disabledCognitoUser = Invoke-AwsJson -Arguments @(
            'cognito-idp', 'admin-get-user', '--user-pool-id', $poolId,
            '--username', $bidderUsername
        )
        if ($disabledCognitoUser.Enabled -ne $false) {
            throw 'Cognito fixture USER was not disabled'
        }

        $enabledUser = Invoke-RestJson -Method 'PATCH' -BaseUrl $restUrl `
            -Path "/api/v1/admin/users/$bidderSub/status" -ApiKey $apiKeyValue `
            -IdToken $adminToken -Body @{ status = 'ACTIVE' }
        $enabledUserData = Assert-RestEnvelope -Response $enabledUser `
            -StatusCode 200 -Code 'ADMIN_USER_STATUS_UPDATED' `
            -DataProperties $userStatusFields
        if ([string]$enabledUserData.status -ne 'ACTIVE' -or
            $enabledUserData.enabled -ne $true) {
            throw 'Admin USER enable result is inconsistent'
        }
        $enabledCognitoUser = Invoke-AwsJson -Arguments @(
            'cognito-idp', 'admin-get-user', '--user-pool-id', $poolId,
            '--username', $bidderUsername
        )
        if ($enabledCognitoUser.Enabled -ne $true) {
            throw 'Cognito fixture USER was not enabled'
        }
        Write-Output 'stage4 admin users: passed'

        if (-not [string]::IsNullOrWhiteSpace($bootstrapToken)) {
            $createdAdminEmail = "stage4-$runId-bootstrap@example.invalid"
            $createdAdmin = Invoke-RestJson -Method 'POST' -BaseUrl $restUrl `
                -Path '/api/v1/admin/admin-accounts' -ApiKey $apiKeyValue `
                -IdToken $bootstrapToken -Body @{
                    email = $createdAdminEmail
                    full_name = "Stage4 $runId bootstrap fixture"
                }
            $createdAdminData = Assert-RestEnvelope -Response $createdAdmin `
                -StatusCode 201 -Code 'ADMIN_INVITED' `
                -DataProperties $userStatusFields
            $createdAdminAccountUsername = [string]$createdAdminData.sub
            if ([string]::IsNullOrWhiteSpace($createdAdminAccountUsername)) {
                throw 'Bootstrap Admin invitation did not return an account identifier'
            }
            $createdUsers.Add($createdAdminAccountUsername)

            $resetAdmin = Invoke-RestJson -Method 'POST' -BaseUrl $restUrl `
                -Path "/api/v1/admin/admin-accounts/$createdAdminAccountUsername/reset-invitation" `
                -ApiKey $apiKeyValue -IdToken $bootstrapToken -Body @{}
            $resetAdminData = Assert-RestEnvelope -Response $resetAdmin `
                -StatusCode 200 -Code 'ADMIN_INVITATION_RESET' `
                -DataProperties $userStatusFields
            if ([string]$resetAdminData.role -ne 'ADMIN') {
                throw 'Bootstrap Admin reset returned a non-Admin account'
            }

            $disabledAdmin = Invoke-RestJson -Method 'PATCH' -BaseUrl $restUrl `
                -Path "/api/v1/admin/admin-accounts/$createdAdminAccountUsername/status" `
                -ApiKey $apiKeyValue -IdToken $bootstrapToken -Body @{ status = 'BANNED' }
            $disabledAdminData = Assert-RestEnvelope -Response $disabledAdmin `
                -StatusCode 200 -Code 'ADMIN_STATUS_UPDATED' `
                -DataProperties $userStatusFields
            if ([string]$disabledAdminData.status -ne 'BANNED') {
                throw 'Bootstrap Admin disable result is inconsistent'
            }

            $enabledAdmin = Invoke-RestJson -Method 'PATCH' -BaseUrl $restUrl `
                -Path "/api/v1/admin/admin-accounts/$createdAdminAccountUsername/status" `
                -ApiKey $apiKeyValue -IdToken $bootstrapToken -Body @{ status = 'ACTIVE' }
            $enabledAdminData = Assert-RestEnvelope -Response $enabledAdmin `
                -StatusCode 200 -Code 'ADMIN_STATUS_UPDATED' `
                -DataProperties $userStatusFields
            if ([string]$enabledAdminData.status -ne 'ACTIVE') {
                throw 'Bootstrap Admin enable result is inconsistent'
            }
        }

        $adminPause = Invoke-RestJson -Method 'POST' -BaseUrl $restUrl `
            -Path "/api/v1/admin/items/$item2Id/pause" -ApiKey $apiKeyValue `
            -IdToken $adminToken
        $pauseData = Assert-RestEnvelope -Response $adminPause `
            -StatusCode 200 -Code 'ITEM_PAUSED' `
            -DataProperties @('status', 'item_id', 'remaining_seconds')
        if ([string]$pauseData.status -ne 'PAUSED' -or
            [string]$pauseData.item_id -ne $item2Id -or
            [int]$pauseData.remaining_seconds -lt 0) {
            throw 'Admin pause result is inconsistent'
        }

        $userDenied = Invoke-RestJson -Method 'POST' -BaseUrl $restUrl `
            -Path "/api/v1/admin/items/$item2Id/resume" -ApiKey $apiKeyValue `
            -IdToken $bidderToken
        if ($userDenied.StatusCode -ne 403) {
            throw 'USER unexpectedly received admin moderation permission'
        }

        $adminResume = Invoke-RestJson -Method 'POST' -BaseUrl $restUrl `
            -Path "/api/v1/admin/items/$item2Id/resume" -ApiKey $apiKeyValue `
            -IdToken $adminToken
        $resumeData = Assert-RestEnvelope -Response $adminResume `
            -StatusCode 200 -Code 'ITEM_RESUMED' `
            -DataProperties @('status', 'item_id', 'end_time')
        if ([string]$resumeData.status -ne 'LIVE' -or
            [string]$resumeData.item_id -ne $item2Id -or
            [long]$resumeData.end_time -le [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()) {
            throw 'Admin resume result is inconsistent'
        }
        $adminState = Get-DynamoItem -TableName $stateTable -Key @{
            item_id = @{ S = $item2Id }
        }
        if ((Get-DynamoString $adminState 'status') -ne 'LIVE') {
            throw 'Admin moderation did not restore LIVE state'
        }

        $auditResponse = Invoke-RestJson -Method 'GET' -BaseUrl $restUrl `
            -Path "/api/v1/admin/audit-events?actorSub=$([uri]::EscapeDataString($adminSub))&pageSize=100" `
            -ApiKey $apiKeyValue -IdToken $adminToken
        $auditData = Assert-RestEnvelope -Response $auditResponse `
            -StatusCode 200 -Code 'AUDIT_EVENTS_LISTED' `
            -DataProperties @('items', 'next_token')
        $auditActions = @($auditData.items | ForEach-Object { [string]$_.action })
        foreach ($requiredAction in @(
            'SESSION_APPROVED', 'SESSION_CANCELLED', 'CATEGORY_CREATED',
            'CATEGORY_UPDATED', 'CATEGORY_ARCHIVED', 'USER_STATUS_UPDATED',
            'ITEM_PAUSED', 'ITEM_RESUMED'
        )) {
            if ($auditActions -notcontains $requiredAction) {
                throw "Admin audit history is missing $requiredAction"
            }
        }
        Write-Output 'stage4 admin audit: passed'
        Write-Output 'stage4 admin: passed'
    }

    Wait-Until -Description 'queue and DLQ health' -Timeout 30 -Condition {
        (Get-QueueCount $commandQueueUrl) -eq 0 -and
        (Get-QueueCount $commandDlqUrl) -eq 0 -and
        (Get-QueueCount $schedulerDlqUrl) -eq 0
    } | Out-Null
    Write-Output 'queue and DLQ: no unexpected messages'
}
catch {
    $mainError = $_
}
finally {
    if (-not [string]::IsNullOrWhiteSpace($catalogTable)) {
        Invoke-CleanupStep -Description 'scoped catalog session discovery' `
            -Errors $cleanupErrors -Action {
                foreach ($generatedSub in @($sellerSub, $bidderSub, $bidderBSub, $adminSub)) {
                    if ([string]::IsNullOrWhiteSpace($generatedSub)) {
                        continue
                    }
                    foreach ($discoveredSessionId in @(
                        Get-ScopedCatalogSessionIds -TableName $catalogTable `
                            -SellerSub $generatedSub -AllowMissingSessionId
                    )) {
                        if (-not $cleanupSessionIds.Contains($discoveredSessionId)) {
                            $cleanupSessionIds.Add($discoveredSessionId)
                        }
                    }
                }
                foreach ($discoveredSessionId in @(
                    Get-ScopedCatalogSessionIds -TableName $catalogTable `
                        -FixtureTitle $invalidFixtureTitle -AllowMissingSessionId
                )) {
                    if (-not $cleanupSessionIds.Contains($discoveredSessionId)) {
                        $cleanupSessionIds.Add($discoveredSessionId)
                    }
                }
            }
    }
    if (-not [string]::IsNullOrWhiteSpace($sessionId) -and
        -not $cleanupSessionIds.Contains($sessionId)) {
        $cleanupSessionIds.Add($sessionId)
    }
    foreach ($candidateItemId in @($item1Id, $item2Id)) {
        if (-not [string]::IsNullOrWhiteSpace($candidateItemId) -and
            -not $cleanupItemIds.Contains($candidateItemId)) {
            $cleanupItemIds.Add($candidateItemId)
        }
    }

    if (-not [string]::IsNullOrWhiteSpace($catalogTable) -and
        $cleanupSessionIds.Count -gt 0) {
        Invoke-CleanupStep -Description 'catalog fixture discovery' `
            -Errors $cleanupErrors -Action {
                foreach ($cleanupSessionId in $cleanupSessionIds.ToArray()) {
                    foreach ($item in @(Get-DynamoPartitionItems `
                        -TableName $catalogTable -PartitionKeyName 'pk' `
                        -PartitionValue "SESSION#$cleanupSessionId")) {
                        $catalogFixtureItems.Add($item)
                        $entityType = Get-DynamoString $item 'entity_type'
                        $discoveredItemId = Get-DynamoString $item 'item_id'
                        if ($entityType -in @('ITEM', 'ITEM_ORDER') -and
                            (Get-DynamoString $item 'session_id') -eq $cleanupSessionId -and
                            -not [string]::IsNullOrWhiteSpace($discoveredItemId) -and
                            -not $cleanupItemIds.Contains($discoveredItemId)) {
                            $cleanupItemIds.Add($discoveredItemId)
                        }
                    }
                }
            }
    }

    if (-not [string]::IsNullOrWhiteSpace($schedulerGroup)) {
        Invoke-CleanupStep -Description 'generated Scheduler fixtures' `
            -Errors $cleanupErrors -Action {
                Remove-GeneratedSchedules -GroupName $schedulerGroup `
                    -SessionIds $cleanupSessionIds.ToArray() `
                    -ItemIds $cleanupItemIds.ToArray()
            }
    }

    if (-not [string]::IsNullOrWhiteSpace($catalogTable) -and
        $cleanupSessionIds.Count -gt 0) {
        Invoke-CleanupStep -Description 'catalog session and item sentinels' `
            -Errors $cleanupErrors -Action {
                $catalogKeys = New-Object System.Collections.Generic.List[object]
                foreach ($item in $catalogFixtureItems.ToArray()) {
                    $entityType = Get-DynamoString $item 'entity_type'
                    if ($entityType -in @('SESSION', 'SESSION_RULES', 'ITEM', 'ITEM_ORDER')) {
                        $catalogKeys.Add((Get-CatalogKey $item))
                    }
                }
                foreach ($itemId in $cleanupItemIds.ToArray()) {
                    foreach ($lookup in @(Get-DynamoPartitionItems `
                        -TableName $catalogTable -PartitionKeyName 'pk' `
                        -PartitionValue "ITEM#$itemId")) {
                        if ((Get-DynamoString $lookup 'entity_type') -eq 'ITEM_LOOKUP' -and
                            (Get-DynamoString $lookup 'item_id') -eq $itemId) {
                            $catalogKeys.Add((Get-CatalogKey $lookup))
                        }
                    }
                }
                if ($catalogKeys.Count -gt 0) {
                    Remove-DynamoKeysBatch -TableName $catalogTable `
                        -Keys $catalogKeys.ToArray()
                }
            }
    }

    if (-not [string]::IsNullOrWhiteSpace($stateTable)) {
        Invoke-CleanupStep -Description 'active item state fixtures' `
            -Errors $cleanupErrors -Action {
                $stateKeys = $cleanupItemIds.ToArray() | ForEach-Object {
                    @{ item_id = @{ S = $_ } }
                }
                if (@($stateKeys).Count -gt 0) {
                    Remove-DynamoKeysBatch -TableName $stateTable -Keys @($stateKeys)
                }
            }
    }

    if (-not [string]::IsNullOrWhiteSpace($eventsTable)) {
        Invoke-CleanupStep -Description 'lifecycle event fixtures' `
            -Errors $cleanupErrors -Action {
                $eventKeys = New-Object System.Collections.Generic.List[object]
                foreach ($itemId in $cleanupItemIds.ToArray()) {
                    foreach ($event in @(Get-DynamoPartitionItems `
                        -TableName $eventsTable -PartitionKeyName 'item_id' `
                        -PartitionValue $itemId)) {
                        $eventKeys.Add((Get-EventKey $event))
                    }
                }
                if ($eventKeys.Count -gt 0) {
                    Remove-DynamoKeysBatch -TableName $eventsTable `
                        -Keys $eventKeys.ToArray()
                }
            }
    }

    if (-not [string]::IsNullOrWhiteSpace($aliasesTable)) {
        Invoke-CleanupStep -Description 'generated bidder aliases' `
            -Errors $cleanupErrors -Action {
                $aliasKeys = New-Object System.Collections.Generic.List[object]
                foreach ($itemId in $cleanupItemIds.ToArray()) {
                    foreach ($alias in @(Get-DynamoPartitionItems `
                        -TableName $aliasesTable -PartitionKeyName 'item_id' `
                        -PartitionValue $itemId)) {
                        $aliasKeys.Add(@{
                            item_id = @{ S = $itemId }
                            user_id = @{ S = Get-DynamoString $alias 'user_id' }
                        })
                    }
                }
                if ($aliasKeys.Count -gt 0) {
                    Remove-DynamoKeysBatch -TableName $aliasesTable `
                        -Keys $aliasKeys.ToArray()
                }
            }
    }

    if (-not [string]::IsNullOrWhiteSpace($connectionsTable)) {
        Invoke-CleanupStep -Description 'generated WebSocket connections' `
            -Errors $cleanupErrors -Action {
                $connectionKeys = New-Object System.Collections.Generic.List[object]
                foreach ($itemId in $cleanupItemIds.ToArray()) {
                    foreach ($connection in @(Get-DynamoPartitionItems `
                        -TableName $connectionsTable -PartitionKeyName 'item_id' `
                        -PartitionValue $itemId)) {
                        $connectionKeys.Add(@{
                            item_id       = @{ S = $itemId }
                            connection_id = @{
                                S = Get-DynamoString $connection 'connection_id'
                            }
                        })
                    }
                }
                   $generatedSubs = @($sellerSub, $bidderSub, $bidderBSub) | Where-Object {
                    -not [string]::IsNullOrWhiteSpace($_)
                }
                if ($generatedSubs.Count -gt 0) {
                    foreach ($auth in @(Get-DynamoPartitionItems `
                        -TableName $connectionsTable -PartitionKeyName 'item_id' `
                        -PartitionValue '__connection_auth__')) {
                        if ($generatedSubs -contains (Get-DynamoString $auth 'user_sub')) {
                            $connectionKeys.Add(@{
                                item_id       = @{ S = '__connection_auth__' }
                                connection_id = @{
                                    S = Get-DynamoString $auth 'connection_id'
                                }
                            })
                        }
                    }
                }
                if ($connectionKeys.Count -gt 0) {
                    Remove-DynamoKeysBatch -TableName $connectionsTable `
                        -Keys $connectionKeys.ToArray()
                }
            }
    }

    if (-not [string]::IsNullOrWhiteSpace($mediaBucket) -and
        -not [string]::IsNullOrWhiteSpace($sellerSub)) {
        Invoke-CleanupStep -Description 'versioned media fixtures' `
            -Errors $cleanupErrors -Action {
                Remove-MediaVersions -BucketName $mediaBucket -SellerSub $sellerSub
        }
    }

    if (-not [string]::IsNullOrWhiteSpace($categoryTable) -and
        -not [string]::IsNullOrWhiteSpace($categoryId)) {
        Invoke-CleanupStep -Description 'category fixture' `
            -Errors $cleanupErrors -Action {
                Remove-DynamoKeysBatch -TableName $categoryTable -Keys @(
                    @{ category_id = @{ S = $categoryId } }
                )
            }
    }

    if (-not [string]::IsNullOrWhiteSpace($auditTable)) {
        Invoke-CleanupStep -Description 'scoped Admin audit fixtures' `
            -Errors $cleanupErrors -Action {
                $fixtureSubs = @($sellerSub, $bidderSub, $bidderBSub, $adminSub) | Where-Object {
                    -not [string]::IsNullOrWhiteSpace($_)
                }
                $fixtureResourceIds = @(
                    $categoryId, $sessionId, $createdAdminAccountUsername
                ) + @($cleanupSessionIds.ToArray()) + @($cleanupItemIds.ToArray()) + @(
                    $fixtureSubs
                ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
                $auditKeys = New-Object System.Collections.Generic.List[object]
                foreach ($event in @(Get-DynamoPartitionItems `
                    -TableName $auditTable -PartitionKeyName 'pk' `
                    -PartitionValue 'AUDIT')) {
                    if ((Get-DynamoString $event 'pk') -ne 'AUDIT') {
                        continue
                    }
                    $actor = Get-DynamoString $event 'actor_sub'
                    $resourceId = Get-DynamoString $event 'resource_id'
                    if (($fixtureSubs -contains $actor) -or
                        ($fixtureResourceIds -contains $resourceId)) {
                        $auditKeys.Add(@{
                            pk = @{ S = 'AUDIT' }
                            sk = @{ S = Get-DynamoString $event 'sk' }
                        })
                    }
                }
                if ($auditKeys.Count -gt 0) {
                    Remove-DynamoKeysBatch -TableName $auditTable `
                        -Keys $auditKeys.ToArray()
                }
            }
    }

    if (-not [string]::IsNullOrWhiteSpace($poolId)) {
        foreach ($username in $createdUsers.ToArray()) {
            Invoke-CleanupStep -Description 'generated Cognito user' `
                -Errors $cleanupErrors -Action {
                    Invoke-AwsJson -Arguments @(
                        'cognito-idp', 'admin-delete-user',
                        '--user-pool-id', $poolId,
                        '--username', $username
                    ) | Out-Null
                }
        }
    }
}

$sellerPassword = $null
$bidderPassword = $null
$bidderBPassword = $null
$adminPassword = $null
$temporaryAdminPassword = $null
$bootstrapPassword = $null
$sellerToken = $null
$bidderToken = $null
$adminToken = $null
$apiKeyValue = $null
$script:TerraformCredentials = $null

if ($null -ne $mainError) {
    if ($cleanupErrors.Count -ne 0) {
        Write-Error -ErrorAction Continue `
            "Scoped cleanup failures: $($cleanupErrors -join ', ')"
    }
    throw $mainError
}
if ($cleanupErrors.Count -ne 0) {
    throw "Scoped cleanup failures: $($cleanupErrors -join ', ')"
}
