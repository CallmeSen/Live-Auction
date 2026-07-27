$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$configPath = Join-Path $repoRoot 'frontend\playwright.config.ts'
$specPath = Join-Path $repoRoot 'frontend\e2e\live-auction.spec.ts'
$environmentPath = Join-Path $repoRoot 'frontend\e2e\live-env.ts'
$packagePath = Join-Path $repoRoot 'frontend\package.json'

Describe 'Stage 4 live browser checkpoint contract' {
    BeforeAll {
        $config = Get-Content -Raw -LiteralPath $configPath -ErrorAction SilentlyContinue
        $spec = Get-Content -Raw -LiteralPath $specPath -ErrorAction SilentlyContinue
        $environment = Get-Content -Raw -LiteralPath $environmentPath -ErrorAction SilentlyContinue
        $package = Get-Content -Raw -LiteralPath $packagePath -ErrorAction SilentlyContinue
    }

    It 'creates the live project only behind the explicit process marker' {
        $config | Should Match "LIVE_AUCTION_E2E\s*===\s*'1'"
        $config | Should Match "name:\s*'live'"
        $config | Should Match "testMatch:\s*'live-auction\.spec\.ts'"
        $config | Should Match "name:\s*'mock'"
    }

    It 'requires a sanitized two-bidder live environment contract' {
        $environment | Should Match 'readLiveAuctionEnvironment'
        foreach ($name in @(
            'LIVE_AUCTION_E2E_BASE_URL',
            'LIVE_AUCTION_E2E_ITEM_ID',
            'LIVE_AUCTION_E2E_BIDDER_A_USERNAME',
            'LIVE_AUCTION_E2E_BIDDER_A_PASSWORD',
            'LIVE_AUCTION_E2E_BIDDER_B_USERNAME',
            'LIVE_AUCTION_E2E_BIDDER_B_PASSWORD',
            'LIVE_AUCTION_E2E_EXTENSION_BID_AMOUNT'
        )) {
            $environment | Should Match $name
        }
        $environment | Should Match 'https:'
        $environment | Should Not Match '(?i)console\.(log|info|warn|error)'
    }

    It 'uses two independent browser contexts and never logs live credentials' {
        $spec | Should Match 'readLiveAuctionEnvironment'
        $spec | Should Match 'liveProcess\.process\?\.env'
        $spec | Should Match 'browser\.newContext'
        $spec | Should Match 'bidderA'
        $spec | Should Match 'bidderB'
        $spec | Should Match 'setOffline\(true\)'
        $spec | Should Match 'extensionBidAmount'
        $spec | Should Match 'Thời gian còn lại'
        $spec | Should Match 'lần gia hạn'
        $spec | Should Match 'toBeGreaterThan'
        $spec | Should Not Match '(?i)console\.(log|info|warn|error)'
        $spec | Should Not Match '(?i)(Write-Host|Write-Output).*?(password|token|secret|api.?key)'
    }

    It 'allows Cognito live login to complete without changing the project timeout' {
        $spec | Should Match "toHaveURL\(/\\/auctions\$/,[\s\S]*?timeout:\s*20_000"
    }

    It 'reads only the countdown value instead of the labelled region text' {
        $spec | Should Match "getByRole\('region',\s*\{\s*name:\s*countdownLabel\s*\}\)"
        $spec | Should Match "countdownRegion\(page\)\.locator\('p'\)\.last\(\)\.textContent\(\)"
        $spec | Should Not Match 'getByLabel\(countdownLabel\)\.textContent\(\)'
    }

    It 'extends the short-lived fixture before the remaining live checks' {
        $extensionIndex = $spec.IndexOf("test('extends the countdown")
        $broadcastIndex = $spec.IndexOf("test('broadcasts an accepted bid")
        $reconnectIndex = $spec.IndexOf("test('reconnects after")
        $extensionIndex | Should BeGreaterThan -1
        $broadcastIndex | Should BeGreaterThan $extensionIndex
        $reconnectIndex | Should BeGreaterThan $broadcastIndex

        $runnerPath = Join-Path $repoRoot 'infra\tests\run-stage3-integration.ps1'
        $runner = Get-Content -Raw -LiteralPath $runnerPath
        $runner | Should Match "LIVE_AUCTION_E2E_EXTENSION_BID_AMOUNT\s*=\s*'205'"
        $runner | Should Match "LIVE_AUCTION_E2E_ACCEPTED_BID_AMOUNT\s*=\s*'210'"
    }

    It 'prepares a bounded near-end browser window after lifecycle verification' {
        $runnerPath = Join-Path $repoRoot 'infra\tests\run-stage3-integration.ps1'
        $runner = Get-Content -Raw -LiteralPath $runnerPath
        $runner | Should Match '(?s)\$item2DurationSeconds\s*=\s*if\s*\(\$RunStage4LiveE2E\).*?300.*?60'
        $runner | Should Match 'duration_s\s*=\s*\$item2DurationSeconds'
        $runner | Should Match '(?s)item two: LIVE.*?AddSeconds\(75\).*?dynamodb.*?update-item.*?ConditionExpression.*?#status = :live AND end_time = :expected_end.*?stage4 browser window: prepared'
        $spec | Should Match "expect\(connectionStatus\(page\)\)\.toContainText\([\s\S]*?timeout:\s*30_000"
    }

    It 'offers a dedicated command without enabling the live project by default' {
        $package | Should Match '"test:e2e"\s*:\s*"playwright test --project=mock"'
        $package | Should Match '"test:e2e:live"\s*:\s*"playwright test --project=live"'
    }

    It 'disables credential-bearing failure artifacts for the live browser project' {
        $config | Should Match "name:\s*'live'[\s\S]*?screenshot:\s*'off'"
        $config | Should Match "name:\s*'live'[\s\S]*?trace:\s*'off'"
    }

    It 'uses the caller-pinned fixture runner only when the Stage 4 switch is set' {
        $runnerPath = Join-Path $repoRoot 'infra\tests\run-stage3-integration.ps1'
        $runner = Get-Content -Raw -LiteralPath $runnerPath
        $runner | Should Match '\[switch\]\$RunStage4LiveE2E'
        $runner | Should Match '\$bidderBUsername'
        $runner | Should Match '(?s)New-CognitoFixtureUser.*?-Group ''BIDDER''.*?\$bidderB'
        $runner | Should Match 'npm run test:e2e:live'
        $runner | Should Match '(?s)finally\s*\{.*?\$bidderBSub.*?generated Cognito user'
    }
}
