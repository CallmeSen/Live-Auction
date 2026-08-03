Describe 'Stage 3 integration runner static safety contract' {
    BeforeAll {
        $scriptPath = Join-Path $PSScriptRoot 'run-stage3-integration.ps1'
        $source = Get-Content -Raw -LiteralPath $scriptPath -ErrorAction SilentlyContinue
        if ($null -eq $source) {
            $source = ''
        }

        $markerLiterals = @(
            'invalid token: denied'
            'seller control plane: created'
            'item one: LIVE'
            'item one: UNSOLD'
            'item two: LIVE'
            'stage4 browser window: prepared'
            'stale close: RESCHEDULED'
            'queue and DLQ: no unexpected messages'
            'stage4 live browser: passed'
        )
    }

    It 'exists and parses as Windows PowerShell 5.1 syntax' {
        (Test-Path -LiteralPath $scriptPath -PathType Leaf) | Should Be $true
        $parseErrors = $null
        [System.Management.Automation.Language.Parser]::ParseFile(
            $scriptPath,
            [ref]$null,
            [ref]$parseErrors
        ) | Out-Null
        @($parseErrors).Count | Should Be 0
    }

    It 'pins safe defaults and terminating errors' {
        $source | Should Match "\[string\]\`$Profile\s*=\s*'la-admin'"
        $source | Should Match "\[string\]\`$Region\s*=\s*'ap-southeast-1'"
        $source | Should Match "\`$ErrorActionPreference\s*=\s*'Stop'"
        $source | Should Match 'Set-StrictMode\s+-Version\s+Latest'
    }

    It 'makes exact STS identity the first external action and gates all later access' {
        $source | Should Match '(?s)if\s*\(\s*\$Profile\s+-ne\s+''la-admin''.*?\$Region\s+-ne\s+''ap-southeast-1''.*?\$caller\s*=\s*Invoke-AwsJson\s+-Arguments\s+@\(\s*''sts'',\s*''get-caller-identity''\s*\).*?\$caller\.Account\s+-ne\s+''233376973052''.*?\$caller\.Arn\s+-ne\s+''arn:aws:iam::233376973052:user/la-admin''.*?\$script:CallerGatePassed\s*=\s*\$true.*?Get-TerraformOutput'
        $source | Should Match '\$caller\.Arn\s+-match\s+[''\"]:root\$[''\"]'
        $source | Should Match 'Assert-CallerGatePassed'
        $source | Should Not Match 'arn:aws:sts::233376973052:assumed-role'
    }

    It 'routes every AWS CLI process through one explicit profile and region boundary' {
        $directAwsCalls = [regex]::Matches($source, '&\s*aws\b')
        $directAwsCalls.Count | Should Be 1
        $source | Should Match '&\s*aws\s+--profile\s+\$Profile\s+--region\s+\$Region'
        $source | Should Match '--no-cli-pager'
        $source | Should Not Match '(?m)^\s*aws\s+'
    }

    It 'exports the aws login session after the caller gate and scopes it to Terraform' {
        $source | Should Match '(?s)function Initialize-TerraformCredentials.*?Assert-CallerGatePassed.*?''configure'',\s*''export-credentials'',\s*''--format'',\s*''process'''
        $source | Should Match '(?s)\$script:CallerGatePassed\s*=\s*\$true\s*Initialize-TerraformCredentials\s*\$poolId\s*=\s*\$null'
        foreach ($name in @(
            'AWS_ACCESS_KEY_ID',
            'AWS_SECRET_ACCESS_KEY',
            'AWS_SESSION_TOKEN',
            'AWS_REGION',
            'AWS_DEFAULT_REGION'
        )) {
            $source | Should Match ([regex]::Escape($name))
        }
        $source | Should Match '(?s)function Get-TerraformOutput.*?SetEnvironmentVariable.*?&\s*terraform.*?finally\s*\{.*?SetEnvironmentVariable'
        $source | Should Match '\$terraformOutputAttempts\s*=\s*3'
        $source | Should Match '(?s)function Get-TerraformOutput.*?for\s*\(\$attempt\s*=\s*1;.*?\$terraformOutputAttempts.*?Start-Sleep\s+-Seconds\s+\$attempt'
        $source | Should Not Match '(?i)Write-(Output|Host|Verbose|Debug).*?(AccessKeyId|SecretAccessKey|SessionToken)'
    }

    It 'normalizes empty and single-line AWS process output under strict mode' {
        $source | Should Match '(?s)function Invoke-AwsJson.*?\$raw\s*=\s*@\(\s*Invoke-AwsCli.*?\)\s*if\s*\(\$raw\.Count\s+-eq\s+0'
        $source | Should Match '\$metadataRaw\s*=\s*@\(\s*Invoke-AwsCli'
    }

    It 'loads every required post-apply output after the caller gate' {
        @(
            'cognito_user_pool_id',
            'cognito_user_pool_client_id',
            'stage3_rest_invoke_url',
            'stage3_rest_api_key_id',
            'auction_catalog_table_name',
            'item_state_table_name',
            'bid_events_table_name',
            'websocket_connections_table_name',
            'bidder_aliases_table_name',
            'bid_commands_queue_url',
            'bid_commands_dlq_url',
            'scheduler_group_name',
            'scheduler_dlq_url',
            'stage3_functions',
            'media_bucket_name'
        ) | ForEach-Object {
            $source | Should Match ([regex]::Escape($_))
        }
        $source | Should Match 'admin_command'
        $source | Should Match 'apigateway'',\s*''get-api-key'''
        $source | Should Match '--include-value'
    }

    It 'loads Stage 3 functions from the isolated compute root' {
        $source | Should Match (
            "Get-TerraformOutput\s+'infra/06-compute/" +
            "stage3-control-plane'\s+'stage3_functions'\s+-Json"
        )
        $source | Should Not Match `
            "Get-TerraformOutput\s+'infra/06-compute'\s+'stage3_functions'"
    }

    It 'keeps credentials and signed material in memory and emits only approved markers' {
        $source | Should Match 'RandomNumberGenerator|RNGCryptoServiceProvider'
        $source | Should Match 'AuthenticationResult\.IdToken'
        $source | Should Not Match '(?m)^\s*Write-(Host|Verbose|Debug)\b'
        $source | Should Not Match '(?i)ConvertTo-SecureString.*-AsPlainText'

        $writes = [regex]::Matches(
            $source,
            "(?m)^\s*Write-Output\s+'([^']+)'\s*$"
        )
        $writes.Count | Should Be 9
        @(Compare-Object `
            @($writes | ForEach-Object { $_.Groups[1].Value } | Sort-Object) `
            @($markerLiterals | Sort-Object)).Count | Should Be 0
    }

    It 'creates scoped USER Cognito fixtures and retains only ID tokens' {
        $source | Should Match 'stage3-'
        $source | Should Match 'cognito-idp'',\s*''admin-create-user'''
        $source | Should Match 'cognito-idp'',\s*''admin-set-user-password'''
        $source | Should Match 'Permanent\s*=\s*\$true'
        $source | Should Match 'cognito-idp'',\s*''admin-add-user-to-group'''
        $source | Should Match "ValidateSet\('USER'\)"
        $source | Should Match "-Group\s+'USER'"
        $source | Should Match 'ADMIN_USER_PASSWORD_AUTH'
        $source | Should Match 'admin-delete-user'
    }

    It 'keeps Cognito passwords out of native process arguments' {
        $source | Should Not Match '''--password'''
        $source | Should Not Match 'PASSWORD=\$Password'
        $source | Should Match '(?s)Invoke-AwsJsonPayload\s+-Arguments\s+@\(\s*''cognito-idp'',\s*''admin-set-user-password''.*?-Payload\s+@\{.*?Password\s*=\s*\$Password'
        $source | Should Match '(?s)Invoke-AwsJsonPayload\s+-Arguments\s+@\(\s*''cognito-idp'',\s*''admin-initiate-auth''.*?AuthParameters\s*=\s*@\{.*?PASSWORD\s*=\s*\$Password'
    }

    It 'allows empty tracking lists before the first fixture and cleanup error' {
        $source | Should Match '(?s)function New-CognitoFixtureUser.*?\[AllowEmptyCollection\(\)\]\s*\[System\.Collections\.Generic\.List\[string\]\]\$CreatedUsers'
        $source | Should Match '(?s)function Invoke-CleanupStep.*?\[AllowEmptyCollection\(\)\]\s*\[System\.Collections\.Generic\.List\[string\]\]\$Errors'
    }

    It 'denies an invalid token on the protected session mutation without leaving a fixture' {
        $source | Should Match '\$invalidFixtureTitle\s*=\s*"stage3-\$runId-invalid-token"'
        $source | Should Match '(?s)\$invalid\s*=\s*Invoke-RestJson\s+-Method\s+''POST''.*?-Path\s+''/api/v1/auction-sessions''.*?-IdToken\s+''clearly-invalid-stage3-token''.*?-Body\s+@\{.*?title\s*=\s*\$invalidFixtureTitle.*?Get-OptionalProperty.*?''session_id''.*?\$cleanupSessionIds\.Add\(\$invalidSessionId\).*?throw\s+''Invalid token request returned a catalog session''.*?\$invalid\.StatusCode\s+-ne\s+401.*?invalid token: denied'
        $source | Should Not Match '(?s)\$invalid\s*=\s*Invoke-RestJson\s+-Method\s+''GET'''
        $source | Should Not Match '@\(401,\s*403\)\s+-notcontains\s+\$invalid\.StatusCode'
    }

    It 'uses one paginated strongly consistent and tightly filtered base-table scan helper' {
        $helperMatch = [regex]::Match(
            $source,
            '(?s)function Get-ScopedCatalogSessionIds\s*\{.*?(?=function Remove-DynamoKeysBatch)'
        )
        $helperMatch.Success | Should Be $true
        $helper = $helperMatch.Value
        $helper | Should Match 'dynamodb'',\s*''scan'''
        $helper | Should Match 'ConsistentRead\s*=\s*\$true'
        $helper | Should Match 'FilterExpression'
        $helper | Should Match '#entity_type\s*=\s*:session'
        $helper | Should Match '#seller_sub\s*=\s*:seller_sub'
        $helper | Should Match '#title\s*=\s*:title'
        $helper | Should Match ''':session''\s*=\s*@\{\s*S\s*=\s*''SESSION''\s*\}'
        $helper | Should Match 'LastEvaluatedKey'
        $helper | Should Match 'ExclusiveStartKey'
        foreach ($field in @('entity_type', 'seller_sub', 'pk', 'sk', 'session_id')) {
            $helper | Should Match ("Get-DynamoString\s+\`$item\s+'" + $field + "'")
        }
        $helper | Should Match 'AllowMissingSessionId'
        $helper | Should Not Match 'batch-write-item|delete-item|Remove-DynamoKeysBatch'
        [regex]::Matches($source, 'dynamodb'',\s*''scan''').Count | Should Be 1
        $source | Should Not Match 'IndexName\s*=\s*''gsi1''|Get-SellerSessionIds'
    }

    It 'uses the final strong scan as the authoritative bidder no-mutation proof' {
        $source | Should Match '(?s)\$wrongRoleSessionId.*?\$cleanupSessionIds\.Add\(\$wrongRoleSessionId\).*?throw\s+''Bidder denial returned a catalog session''.*?\$wrongRole\.StatusCode\s+-ne\s+403'
        $source | Should Match '(?s)\$bidderProofDeadline.*?do\s*\{.*?Get-ScopedCatalogSessionIds.*?-SellerSub\s+\$bidderSub.*?Start-Sleep\s+-Seconds\s+\$bidderProofBackoff.*?\}\s*while.*?\$finalBidderSessionIds\s*=\s*@\(Get-ScopedCatalogSessionIds.*?-SellerSub\s+\$bidderSub.*?-RequireSessionId.*?\$cleanupSessionIds\.Add\(\$unexpectedSessionId\).*?throw\s+''Bidder denial created a catalog session''.*?\$sessionResponse\s*='
    }

    It 're-discovers exact generated sessions strongly consistently before finally cleanup' {
        $source | Should Match '(?s)finally\s*\{.*?scoped catalog session discovery.*?@\(\$sellerSub,\s*\$bidderSub,\s*\$bidderBSub\).*?Get-ScopedCatalogSessionIds.*?-SellerSub\s+\$generatedSub.*?-AllowMissingSessionId.*?Get-ScopedCatalogSessionIds.*?-FixtureTitle\s+\$invalidFixtureTitle.*?-AllowMissingSessionId.*?catalog fixture discovery'
    }

    It 'executes the exact seller REST lifecycle with structured checks' {
        $source | Should Match '(?s)''POST''.*?''/api/v1/auction-sessions'''
        $source | Should Match '(?s)''PUT''.*?/api/v1/auction-sessions/\$sessionId/rules'
        $source | Should Match '/api/v1/auction-sessions/\$sessionId/items'
        $source | Should Match '/api/v1/auction-sessions/\$sessionId/schedule'
        $source | Should Match 'min_increment\s*=\s*''5'''
        $source | Should Match 'max_increment\s*=\s*''500'''
        $source | Should Match 'anti_snipe_window_s\s*=\s*30'
        $source | Should Match 'anti_snipe_extend_s\s*=\s*60'
        $source | Should Match 'duration_s\s*=\s*60'
        $source | Should Match 'Assert-RestEnvelope'
        $source | Should Match 'Assert-ExactProperties'
    }

    It 'aligns the start to a sufficiently future Scheduler minute and polls by deadline with backoff' {
        $source | Should Match 'Ceiling.*60'
        $source | Should Match 'AddSeconds|ToUnixTimeSeconds'
        $source | Should Match 'Wait-Until'
        $source | Should Match 'deadline'
        $source | Should Match 'backoff'
        $source | Should Match 'Start-Sleep\s+-Seconds\s+\$'
        $source | Should Not Match 'Start-Sleep\s+-Seconds\s+\d+'
    }

    It 'validates exact lifecycle IDs statuses and versions from typed DynamoDB JSON' {
        $source | Should Match 'dynamodb'',\s*''get-item'''
        $source | Should Match 'ConsistentRead\s*=\s*\$true'
        $source | Should Match 'Get-DynamoString'
        $source | Should Match 'Get-DynamoNumber'
        $source | Should Match "'LIVE'"
        $source | Should Match "'UNSOLD'"
        $source | Should Match 'version'
        $source | Should Match 'session_id'
        $source | Should Match 'item_id'
    }

    It 'proves stale close through conditional extension typed invocation and deterministic schedule' {
        $source | Should Match 'dynamodb'',\s*''update-item'''
        $source | Should Match 'ConditionExpression'
        $source | Should Match 'SET end_time = :new_end, version = version \+ :one'
        $source | Should Match "command\s*=\s*'CLOSE_ITEM'"
        $source | Should Match 'expected_end_epoch\s*=\s*\$oldExpectedEnd'
        $source | Should Match 'lambda'',\s*''invoke'''
        $source | Should Match 'RESCHEDULED'
        $source | Should Match 'close-item-\$item2Id-\$newExpectedEnd'
        $source | Should Match 'scheduler'',\s*''get-schedule'''
    }

    It 'checks queue and both DLQ health without consuming messages' {
        $source | Should Match 'sqs'',\s*''get-queue-attributes'''
        $source | Should Match 'ApproximateNumberOfMessages'
        $source | Should Match 'ApproximateNumberOfMessagesNotVisible'
        $source | Should Match 'ApproximateNumberOfMessagesDelayed'
        $source | Should Match 'schedulerDlqUrl'
        $source | Should Match '(?s)\$queueBaseline\s*=\s*Get-QueueCount\s+\$commandQueueUrl.*?\$commandDlqBaseline\s*=\s*Get-QueueCount\s+\$commandDlqUrl.*?\$schedulerDlqBaseline\s*=\s*Get-QueueCount\s+\$schedulerDlqUrl.*?\$queueBaseline\s+-ne\s+0\s+-or.*?\$commandDlqBaseline\s+-ne\s+0\s+-or.*?\$schedulerDlqBaseline\s+-ne\s+0.*?clearly-invalid-stage3-token'
        $source | Should Match '(?s)Wait-Until\s+-Description\s+''queue and DLQ health''.*?Get-QueueCount\s+\$commandQueueUrl\)\s+-eq\s+0\s+-and.*?Get-QueueCount\s+\$commandDlqUrl\)\s+-eq\s+0\s+-and.*?Get-QueueCount\s+\$schedulerDlqUrl\)\s+-eq\s+0'
        $source | Should Not Match 'Get-QueueCount\s+\$\w+\)\s+-le\s+\$\w+Baseline'
        $source | Should Not Match 'receive-message|delete-message|purge-queue'
    }

    It 'uses finally cleanup scoped to generated IDs and exact schedule names' {
        $source | Should Match 'finally\s*\{'
        $source | Should Match 'Invoke-CleanupStep'
        $source | Should Match 'list-schedules'
        $source | Should Match 'start-session-\$sessionId'
        $source | Should Match 'close-item-'
        $source | Should Match 'delete-schedule'
        $source | Should Match 'lifecycle-watchdog'
        $source | Should Match 'ITEM_ORDER'
        $source | Should Match 'ITEM#\$itemId'
        $source | Should Match '__connection_auth__'
        $source | Should Match 'stage3-'
    }

    It 'captures provisional API identifiers and discovers partial item fixtures before deletion' {
        $source | Should Match '(?s)\$invalid\s*=.*?Get-OptionalProperty.*?''session_id''.*?\$cleanupSessionIds\.Add\(\$invalidSessionId\).*?throw\s+''Invalid token request returned a catalog session''.*?\$invalid\.StatusCode\s+-ne\s+401'
        $source | Should Match '(?s)\$wrongRole\s*=.*?Get-OptionalProperty.*?''session_id''.*?\$cleanupSessionIds\.Add\(\$wrongRoleSessionId\).*?throw\s+''Bidder denial returned a catalog session''.*?\$wrongRole\.StatusCode\s+-ne\s+403'
        $source | Should Match '(?s)\$sessionResponse\s*=.*?Get-OptionalProperty.*?''session_id''.*?Assert-RestEnvelope'
        $source | Should Match '(?s)\$item1Response\s*=.*?Get-OptionalProperty.*?''item_id''.*?Assert-RestEnvelope'
        $source | Should Match '(?s)\$item2Response\s*=.*?Get-OptionalProperty.*?''item_id''.*?Assert-RestEnvelope'
        $source | Should Match '\$catalogFixtureItems\s*=\s*New-Object\s+System\.Collections\.Generic\.List\[object\]'
        $source | Should Match '\$cleanupItemIds\s*=\s*New-Object\s+System\.Collections\.Generic\.List\[string\]'
        $source | Should Match '\$entityType\s+-in\s+@\(''ITEM'',\s*''ITEM_ORDER''\)'
        $source | Should Match '\$cleanupItemIds\.ToArray\(\)'
    }

    It 'uses typed paginated batch cleanup and retries unprocessed items' {
        $source | Should Match 'dynamodb'',\s*''query'''
        $source | Should Match 'LastEvaluatedKey'
        $source | Should Match 'dynamodb'',\s*''batch-write-item'''
        $source | Should Match 'UnprocessedItems'
        $source | Should Match "Get-OptionalProperty\s+\`$response\s+'UnprocessedItems'"
        $source | Should Match 'Get-OptionalCollection\s+\$unprocessedItems\s+\$TableName'
        $source | Should Not Match '\$response\.UnprocessedItems'
        $source | Should Match 'GetRange\(0,\s*\[Math\]::Min\(25'
        $source | Should Match 'pk\s*=\s*@\{\s*S\s*='
        $source | Should Match 'sk\s*=\s*@\{\s*S\s*='
        $source | Should Not Match 'batch-write-item.*\*'
    }

    It 'removes bid audit events by exact generated item ID without requiring a session ID' {
        $eventCleanup = [regex]::Match(
            $source,
            '(?s)if \(-not \[string\]::IsNullOrWhiteSpace\(\$eventsTable\)\).*?(?=if \(-not \[string\]::IsNullOrWhiteSpace\(\$aliasesTable\))'
        ).Value

        $eventCleanup | Should Match '\$cleanupItemIds\.ToArray\(\)'
        $eventCleanup | Should Match '(?s)Get-DynamoPartitionItems.*?-PartitionKeyName ''item_id''.*?-PartitionValue \$itemId'
        $eventCleanup | Should Match '\$eventKeys\.Add\(\(Get-EventKey \$event\)\)'
        $eventCleanup | Should Not Match '\$cleanupSessionIds\.Contains'
        $eventCleanup | Should Match 'Remove-DynamoKeysBatch\s+-TableName \$eventsTable'
    }

    It 'normalizes optional AWS collections without materializing a null item' {
        $source | Should Match '(?s)function Get-OptionalCollection.*?System\.Collections\.Generic\.List\[object\].*?\$null\s+-eq\s+\$property\.Value.*?\$items\.ToArray\(\)'
        foreach ($name in @('Items', 'Schedules', 'Versions', 'DeleteMarkers', 'Errors')) {
            $source | Should Match ("Get-OptionalCollection\s+.*?'" + $name + "'")
        }
        $source | Should Not Match '@\(Get-OptionalProperty\s+.*?''(Items|Schedules|Versions|DeleteMarkers|Errors)''\)'
    }

    It 'materializes generic lists before crossing PowerShell array boundaries' {
        @(
            'items',
            'schedules',
            'chunk',
            'catalogFixtureItems',
            'catalogKeys',
            'eventKeys',
            'aliasKeys',
            'connectionKeys',
            'cleanupItemIds',
            'cleanupSessionIds',
            'createdUsers'
        ) | ForEach-Object {
            $source | Should Match ('\$' + $_ + '\.ToArray\(\)')
        }
        $source | Should Not Match '@\(\$(items|schedules|catalogKeys|eventKeys|aliasKeys|connectionKeys|createdUsers)\)'
    }

    It 'deletes every media version and delete marker only below the seller prefix' {
        $source | Should Match 's3api'',\s*''list-object-versions'''
        $source | Should Match 'items/\$sellerSub/'
        $source | Should Match "Get-OptionalCollection\s+\`$response\s+'Versions'"
        $source | Should Match "Get-OptionalCollection\s+\`$response\s+'DeleteMarkers'"
        $source | Should Match 's3api'',\s*''delete-objects'''
        $source | Should Match 'VersionId'
        $source | Should Not Match 's3\s+rm|rb\s+--force|force-delete'
    }

    It 'inspects per-object media delete failures and retries only failed versions within bounds' {
        $mediaMatch = [regex]::Match(
            $source,
            '(?s)function Remove-MediaVersions\s*\{.*?(?=function Invoke-CleanupStep)'
        )
        $mediaMatch.Success | Should Be $true
        $mediaSource = $mediaMatch.Value
        $contract = {
            param([string]$Text)

            foreach ($pattern in @(
                '\$deleteResponse\s*=\s*Invoke-AwsJsonPayload',
                '\$deleteErrors\s*=\s*@\(\s*Get-OptionalCollection\s+\$deleteResponse\s+''Errors''\s*\)',
                '\$failedObjects\.Add\(',
                '(?s)foreach\s*\(\$failedObject\s+in\s+\$failedObjects\.ToArray\(\)\).*?\$pending\.Add\(\s*@\{\s*Key\s*=\s*\[string\]\$failedObject\.Key\s*VersionId\s*=\s*\[string\]\$failedObject\.VersionId',
                '\$deleteAttempt\s+-ge\s+\$maxDeleteAttempts',
                '\[DateTimeOffset\]::UtcNow\s+-ge\s+\$deleteDeadline',
                'Start-Sleep\s+-Seconds\s+\$deleteBackoff',
                'throw\s+''Media version cleanup retained failed objects'''
            )) {
                if ($Text -notmatch $pattern) {
                    return $false
                }
            }
            return $true
        }

        (& $contract $mediaSource) | Should Be $true
        $mutations = @(
            $mediaSource -replace '''Errors''', '''Deleted'''
            $mediaSource -replace '\$failedObjects\.ToArray\(\)', '$requestedObjects'
            $mediaSource -replace '\[DateTimeOffset\]::UtcNow\s+-ge\s+\$deleteDeadline', '$false'
            $mediaSource -replace '\$deleteAttempt\s+-ge\s+\$maxDeleteAttempts', '$false'
            $mediaSource -replace "throw\s+'Media version cleanup retained failed objects'", 'return'
        )
        foreach ($mutation in $mutations) {
            $mutation | Should Not Be $mediaSource
            (& $contract $mutation) | Should Be $false
        }
        $mediaSource | Should Not Match '(?i)Write-(Output|Host|Verbose|Debug)'
        $mediaSource | Should Not Match '(?i)throw[^\r\n]*\$(failedKey|failedVersionId|deleteErrors|deleteResponse)'
        $mediaSource | Should Not Match '(?i)presign|https?://'
    }

    It 'preserves the primary error while accumulating sanitized cleanup failures' {
        $source | Should Match '\$mainError\s*=\s*\$_'
        $source | Should Match 'System\.Collections\.Generic\.List\[string\]'
        $source | Should Match 'Scoped cleanup failures'
        $source | Should Match 'throw\s+\$mainError'
        $source | Should Not Match '(?i)cleanup.*?(password|token|api.?key|presign|secret)'
    }

    It 'contains no Terraform mutation provider probe or live auto-run' {
        $source | Should Not Match 'terraform\s+(plan|apply|destroy|import|refresh)'
        $source | Should Not Match 'providers\s+schema|terraform-provider-aws'
        $source | Should Not Match 'Remove-Item.*-Recurse'

        $testSource = Get-Content -Raw -LiteralPath $PSCommandPath
        $testSource | Should Not Match '(?m)^\s*[.&]\s+.*run-stage3-integration\.ps1'
    }
}

Describe 'Stage 3 targeted teardown static safety contract' {
    BeforeAll {
        $teardownPath = Join-Path $PSScriptRoot 'run-stage3-teardown.ps1'
        $teardown = Get-Content -Raw -LiteralPath $teardownPath `
            -ErrorAction SilentlyContinue
        if ($null -eq $teardown) {
            $teardown = ''
        }
    }

    It 'exists and parses as Windows PowerShell 5.1 syntax' {
        (Test-Path -LiteralPath $teardownPath -PathType Leaf) | Should Be $true
        $parseErrors = $null
        [System.Management.Automation.Language.Parser]::ParseFile(
            $teardownPath,
            [ref]$null,
            [ref]$parseErrors
        ) | Out-Null
        @($parseErrors).Count | Should Be 0
    }

    It 'pins exact la-admin and requires an explicit apply switch' {
        $teardown | Should Match "\[string\]\`$Profile\s*=\s*'la-admin'"
        $teardown | Should Match "\[string\]\`$Region\s*=\s*'ap-southeast-1'"
        $teardown | Should Match '\[switch\]\$Apply'
        $teardown | Should Match '233376973052'
        $teardown | Should Match 'arn:aws:iam::233376973052:user/la-admin'
        $teardown | Should Match ':root\$'
        $teardown | Should Match 'CallerGatePassed'
    }

    It 'preflights every fixture surface and exact API logging ownership' {
        foreach ($operation in @(
            'cognito-idp'',\s*''list-users',
            'scheduler'',\s*''list-schedules',
            'dynamodb'',\s*''scan',
            'dynamodb'',\s*''describe-table',
            's3api'',\s*''list-object-versions',
            'sqs'',\s*''get-queue-attributes',
            'apigateway'',\s*''get-account',
            'apigateway'',\s*''get-rest-apis',
            'apigateway'',\s*''get-stages'
        )) {
            $teardown | Should Match $operation
        }
        $teardown | Should Match 'arn:aws:iam::233376973052:role/la-api-gateway-cloudwatch'
        $teardown | Should Match 'la-lifecycle-watchdog'
        $teardown | Should Match 'Versions'
        $teardown | Should Match 'DeleteMarkers'
        $teardown | Should Match 'loggingLevel'
        $teardown | Should Match 'dataTraceEnabled'
        $teardown | Should Match 'metricsEnabled'
        $teardown | Should Match 'accessLogSettings'
        $teardown | Should Match 'state'',\s*''list'',\s*\$address'
    }

    It 'plans and applies only the four isolated roots in reverse dependency order' {
        $expectedOrder = @(
            'infra/07-api',
            'infra/06-compute/stage3-control-plane',
            'infra/05-messaging',
            'infra/04-data'
        )
        $moduleBlock = [regex]::Match(
            $teardown,
            '(?s)\$modules\s*=\s*@\(.*?(?=if\s*\(\$Profile)'
        ).Value
        $positions = @($expectedOrder | ForEach-Object {
            $moduleBlock.IndexOf($_)
        })
        foreach ($position in $positions) {
            $position | Should BeGreaterThan -1
        }
        for ($index = 1; $index -lt $positions.Count; $index++) {
            $positions[$index] | Should BeGreaterThan $positions[$index - 1]
        }
        $teardown | Should Match 'enable_stage3=false'
        $teardown | Should Match 'stage3-disable\.tfplan'
        $teardown | Should Match 'show'',\s*''-json'
        $teardown | Should Match 'Get-FileHash\s+\$planPath'
        $teardown | Should Match 'if\s*\(\s*-not\s+\$Apply\s*\)'
    }

    It 'uses strict per-module allowlists and preserves Stage 1 and 2' {
        foreach ($address in @(
            'aws_api_gateway_rest_api.stage3',
            'aws_lambda_function.admin_command',
            'aws_scheduler_schedule_group.main',
            'aws_dynamodb_table.auction_catalog',
            'aws_s3_bucket.media',
            'aws_dynamodb_global_secondary_index.bid_events_by_bidder'
        )) {
            $teardown | Should Match ([regex]::Escape($address))
        }
        $teardown | Should Match 'bidder_sub-sk-index'
        $teardown | Should Match 'delete,create'
        $teardown | Should Match 'Unexpected.*disable plan'
        $teardown | Should Not Match 'terraform\s+destroy|''destroy'''
        $teardown | Should Not Match '(?i)-target'
        $teardown | Should Not Match 'infra/06-compute[''"\s,]'
    }
}
