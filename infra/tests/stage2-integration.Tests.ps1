$scriptPath = Join-Path $PSScriptRoot 'run-stage2-integration.ps1'
$source = if (Test-Path -LiteralPath $scriptPath) {
    Get-Content -LiteralPath $scriptPath -Raw
}
else {
    ''
}

Describe 'Stage 2 integration runner contract' {
    It 'exists and defaults to the approved profile and region' {
        Test-Path -LiteralPath $scriptPath | Should Be $true
        $source | Should Match '\[string\]\$Profile\s*=\s*''la'''
        $source | Should Match '\[string\]\$Region\s*=\s*''ap-southeast-1'''
        $source | Should Match '\[switch\]\$LeaveUsers'
    }

    It 'removes ambient credentials and enforces the la-admin account boundary' {
        $source | Should Match 'AWS_ACCESS_KEY_ID.*AWS_SECRET_ACCESS_KEY.*AWS_SESSION_TOKEN'
        $source | Should Match '233376973052'
        $source | Should Match 'arn:aws:iam::233376973052:user/la-admin'
        $source | Should Match 'sts.*get-caller-identity'
    }

    It 'uses Cognito admin setup without printing credentials or tokens' {
        foreach ($command in @(
            'admin-create-user',
            'admin-set-user-password',
            'admin-add-user-to-group',
            'admin-initiate-auth',
            'admin-delete-user'
        )) {
            $source | Should Match $command
        }
        $source | Should Not Match 'Write-(Host|Output).*\$(password|token|idToken)'
    }

    It 'uses bounded ClientWebSocket operations and checks invalid authentication' {
        $source | Should Match 'System\.Net\.WebSockets\.ClientWebSocket'
        $source | Should Match 'CancellationTokenSource'
        $source | Should Match 'InnerException'
        $source | Should Match '401.*403|403.*401'
        $source | Should Match '\[void\]\$socket\.ConnectAsync'
        $source | Should Match 'invalid token: denied'
        $source | Should Match 'Get-MessageProperty'
        $source | Should Match 'Receive-UntilMessage'
    }

    It 'checks accepted fan-out, targeted rejection, and trusted bidder identity' {
        $source | Should Match 'accepted bid: delivered to 2 connections'
        $source | Should Match 'rejected bid: delivered to origin only'
        $source | Should Match 'forged user_sub: ignored'
        $source | Should Match 'bidder_sub'
    }

    It 'performs scoped fixture cleanup and queue checks' {
        $source | Should Match 'finally'
        $source | Should Match 'dynamodb.*delete-item'
        $source | Should Match 'cognito-idp.*admin-delete-user'
        $source | Should Match 'ApproximateNumberOfMessagesNotVisible'
        $source | Should Match 'queue and DLQ: no unexpected messages'
    }
}
