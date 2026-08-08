$repoRoot = Split-Path -Parent $PSScriptRoot
$moduleRoot = Join-Path $repoRoot '04-data'

function Get-HclBlock([string]$Text, [string]$HeaderPattern) {
    $match = [regex]::Match($Text, "$HeaderPattern\s*\{")
    if (-not $match.Success) {
        return ''
    }

    $openBrace = $Text.IndexOf('{', $match.Index)
    $depth = 0
    $inString = $false
    $escaped = $false

    for ($index = $openBrace; $index -lt $Text.Length; $index++) {
        $current = $Text[$index]

        if ($current -eq '"' -and -not $escaped) {
            $inString = -not $inString
        }

        if (-not $inString) {
            if ($current -eq '{') {
                $depth++
            }
            elseif ($current -eq '}') {
                $depth--
                if ($depth -eq 0) {
                    return $Text.Substring(
                        $match.Index,
                        $index - $match.Index + 1
                    )
                }
            }
        }

        if ($inString -and $current -eq '\' -and -not $escaped) {
            $escaped = $true
        }
        else {
            $escaped = $false
        }
    }

    return ''
}

function Get-HclBlocks([string]$Text, [string]$HeaderPattern) {
    $blocks = @()
    foreach ($match in [regex]::Matches($Text, "$HeaderPattern\s*\{")) {
        $tail = $Text.Substring($match.Index)
        $block = Get-HclBlock $tail $HeaderPattern
        if ($block) {
            $blocks += $block
        }
    }
    return $blocks
}

$main = Get-Content -Raw -LiteralPath (Join-Path $moduleRoot 'main.tf')
$variables = Get-Content -Raw -LiteralPath `
    (Join-Path $moduleRoot 'variables.tf')
$outputs = Get-Content -Raw -LiteralPath `
    (Join-Path $moduleRoot 'outputs.tf')
$all = (Get-ChildItem -LiteralPath $moduleRoot -Filter '*.tf' -File |
    Sort-Object FullName |
    ForEach-Object { Get-Content -Raw -LiteralPath $_.FullName }) -join "`n"

Describe 'Stage 3 data rollout inputs' {
    It 'defaults the Stage 3 resource gate to false' {
        $enableStage3 = Get-HclBlock $variables `
            'variable\s+"enable_stage3"'

        $enableStage3 | Should Match 'type\s*=\s*bool'
        $enableStage3 | Should Match 'default\s*=\s*false'
    }

    It 'requires a nonempty unique list of canonical media origins' {
        $origins = Get-HclBlock $variables `
            'variable\s+"media_allowed_origins"'

        $origins | Should Match 'type\s*=\s*list\(string\)'
        $origins | Should Match `
            'default\s*=\s*\[\s*"http://localhost:5173"\s*\]'
        $origins | Should Match `
            'length\(var\.media_allowed_origins\)\s*>\s*0'
        $origins | Should Match `
            'length\(distinct\(var\.media_allowed_origins\)\)\s*==\s*length\(var\.media_allowed_origins\)'
        $origins | Should Match 'alltrue\('
        $origins | Should Match 'can\(regex\("\^https\?://'
        $origins | Should Match '!strcontains\(origin,\s*"\*"\)'
        $origins | Should Match 'origin\s*==\s*lower\(origin\)'
        $origins | Should Match `
            'error_message\s*=\s*"[^"\r\n]*(?:unique|duplicate)[^"\r\n]*lowercase[^"\r\n]*"'
    }

    It 'rejects malformed hosts, URI components, and noncanonical case' {
        $origins = Get-HclBlock $variables `
            'variable\s+"media_allowed_origins"'
        $regexLiteral = [regex]::Match(
            $origins,
            'can\(regex\("([^"\r\n]+)"'
        ).Groups[1].Value
        $originPattern = '(?-i)' + $regexLiteral.Replace('\\', '\')

        foreach ($origin in @(
            'http://localhost',
            'http://localhost:5173',
            'https://auction.example.com',
            'https://auction-1.dev.example:1',
            'https://a.co:65535'
        )) {
            $origin | Should Match $originPattern
        }

        foreach ($origin in @(
            'https://auction..example.com',
            'https://-auction.example.com',
            'https://auction-.example.com',
            'https://auction.example.com/media',
            'https://auction.example.com?item=1',
            'https://auction.example.com#media',
            'https://user@auction.example.com',
            'https://*.example.com',
            'HTTP://localhost',
            'https://Auction.example.com'
        )) {
            $origin | Should Not Match $originPattern
        }
    }

    It 'limits explicit origin ports to the valid TCP range' {
        $origins = Get-HclBlock $variables `
            'variable\s+"media_allowed_origins"'

        $origins | Should Match `
            'try\(tonumber\(regex\(":\(\[0-9\]\{1,5\}\)\$",\s*origin\)\[0\]\),\s*1\)\s*>=\s*1'
        $origins | Should Match `
            'try\(tonumber\(regex\(":\(\[0-9\]\{1,5\}\)\$",\s*origin\)\[0\]\),\s*1\)\s*<=\s*65535'
    }
}

Describe 'Stage 3 auction catalog' {
    It 'is disabled by default and follows the established table naming scheme' {
        $catalog = Get-HclBlock $main `
            'resource\s+"aws_dynamodb_table"\s+"auction_catalog"'

        $main | Should Match `
            'auction_catalog\s*=\s*"\$\{var\.name_prefix\}_auction_catalog"'
        $catalog | Should Match `
            'count\s*=\s*var\.enable_stage3\s*\?\s*1\s*:\s*0'
        $catalog | Should Match 'name\s*=\s*local\.table_names\.auction_catalog'
    }

    It 'uses on-demand pk and sk keys with managed protection and no TTL' {
        $catalog = Get-HclBlock $main `
            'resource\s+"aws_dynamodb_table"\s+"auction_catalog"'

        $catalog | Should Match 'billing_mode\s*=\s*"PAY_PER_REQUEST"'
        $catalog | Should Match 'hash_key\s*=\s*"pk"'
        $catalog | Should Match 'range_key\s*=\s*"sk"'
        $catalog | Should Match `
            '(?s)attribute\s*\{\s*name\s*=\s*"pk"\s*type\s*=\s*"S"\s*\}'
        $catalog | Should Match `
            '(?s)attribute\s*\{\s*name\s*=\s*"sk"\s*type\s*=\s*"S"\s*\}'
        $catalog | Should Match `
            'server_side_encryption\s*\{\s*enabled\s*=\s*true'
        $catalog | Should Match `
            'point_in_time_recovery\s*\{\s*enabled\s*=\s*true'
        $catalog | Should Not Match '\bttl\s*\{'
    }

    It 'defines the gsi1 and gsi2 ALL-projection indexes' {
        $catalog = Get-HclBlock $main `
            'resource\s+"aws_dynamodb_table"\s+"auction_catalog"'
        $gsi1 = Get-HclBlocks $catalog 'global_secondary_index' |
            Where-Object { $_ -match 'name\s*=\s*"gsi1"' } |
            Select-Object -First 1
        $gsi2 = Get-HclBlocks $catalog 'global_secondary_index' |
            Where-Object { $_ -match 'name\s*=\s*"gsi2"' } |
            Select-Object -First 1

        foreach ($attribute in @('gsi1pk', 'gsi1sk', 'gsi2pk', 'gsi2sk')) {
            $catalog | Should Match `
                "(?s)attribute\s*\{\s*name\s*=\s*`"$attribute`"\s*type\s*=\s*`"S`"\s*\}"
        }

        $gsi1 | Should Match `
            '(?s)key_schema\s*\{\s*attribute_name\s*=\s*"gsi1pk"\s*key_type\s*=\s*"HASH"\s*\}'
        $gsi1 | Should Match `
            '(?s)key_schema\s*\{\s*attribute_name\s*=\s*"gsi1sk"\s*key_type\s*=\s*"RANGE"\s*\}'
        $gsi1 | Should Match 'projection_type\s*=\s*"ALL"'
        $gsi1 | Should Not Match '\b(?:hash_key|range_key)\s*='
        $gsi2 | Should Match `
            '(?s)key_schema\s*\{\s*attribute_name\s*=\s*"gsi2pk"\s*key_type\s*=\s*"HASH"\s*\}'
        $gsi2 | Should Match `
            '(?s)key_schema\s*\{\s*attribute_name\s*=\s*"gsi2sk"\s*key_type\s*=\s*"RANGE"\s*\}'
        $gsi2 | Should Match 'projection_type\s*=\s*"ALL"'
        $gsi2 | Should Not Match '\b(?:hash_key|range_key)\s*='
    }
}

Describe 'Stage 3 bidder event lookup' {
    It 'manages the Stage 3 GSI separately from the preserved Stage 1 table' {
        $bidEvents = Get-HclBlock $main `
            'resource\s+"aws_dynamodb_table"\s+"bid_events"'
        $bidderIndex = Get-HclBlock $main `
            'resource\s+"aws_dynamodb_global_secondary_index"\s+"bid_events_by_bidder"'

        $bidEvents | Should Not Match 'bidder_sub|global_secondary_index'
        $bidderIndex | Should Match `
            'count\s*=\s*var\.enable_stage3\s*\?\s*1\s*:\s*0'
        $bidderIndex | Should Match `
            'table_name\s*=\s*aws_dynamodb_table\.bid_events\.name'
        $bidderIndex | Should Match 'index_name\s*=\s*"bidder_sub-sk-index"'
        $bidderIndex | Should Match `
            '(?s)projection\s*\{\s*projection_type\s*=\s*"ALL"\s*\}'
        $bidderIndex | Should Match `
            '(?s)key_schema\s*\{\s*attribute_name\s*=\s*"bidder_sub"\s*attribute_type\s*=\s*"S"\s*key_type\s*=\s*"HASH"\s*\}'
        $bidderIndex | Should Match `
            '(?s)key_schema\s*\{\s*attribute_name\s*=\s*"sk"\s*attribute_type\s*=\s*"S"\s*key_type\s*=\s*"RANGE"\s*\}'
    }

    It 'preserves the Stage 1 stream and recovery behavior' {
        $bidEvents = Get-HclBlock $main `
            'resource\s+"aws_dynamodb_table"\s+"bid_events"'

        $bidEvents | Should Match 'stream_enabled\s*=\s*true'
        $bidEvents | Should Match 'stream_view_type\s*=\s*"NEW_IMAGE"'
        $bidEvents | Should Match `
            'point_in_time_recovery\s*\{\s*enabled\s*=\s*true'
    }
}

Describe 'Stage 3 private item media storage' {
    It 'gates caller identity and the account-qualified bucket' {
        $identity = Get-HclBlock $main `
            'data\s+"aws_caller_identity"\s+"current"'
        $bucket = Get-HclBlock $main `
            'resource\s+"aws_s3_bucket"\s+"media"'

        $identity | Should Match `
            'count\s*=\s*var\.enable_stage3\s*\?\s*1\s*:\s*0'
        $bucket | Should Match `
            'count\s*=\s*var\.enable_stage3\s*\?\s*1\s*:\s*0'
        $bucket | Should Match `
            'bucket\s*=\s*"\$\{var\.name_prefix\}-item-media-\$\{data\.aws_caller_identity\.current\[0\]\.account_id\}-\$\{var\.aws_region\}"'
        $bucket | Should Match 'force_destroy\s*=\s*false'
        $bucket | Should Not Match '\b(?:acl|grant)\s*='
    }

    It 'gates S3-safe prefix and final bucket length preconditions' {
        $namePrefix = Get-HclBlock $variables 'variable\s+"name_prefix"'
        $bucket = Get-HclBlock $main `
            'resource\s+"aws_s3_bucket"\s+"media"'

        $namePrefix | Should Match `
            'description\s*=\s*"[^"\r\n]*[Ee]nvironment-unique[^"\r\n]*account[^"\r\n]*region[^"\r\n]*external[^"\r\n]*"'
        $namePrefix | Should Match 'default\s*=\s*"la"'
        $bucket | Should Match `
            '(?s)lifecycle\s*\{.*precondition\s*\{.*can\(regex\("\^\[a-z0-9\]'
        $bucket | Should Match `
            '!startswith\(var\.name_prefix,\s*"xn--"\)'
        $bucket | Should Match `
            '!startswith\(var\.name_prefix,\s*"sthree-"\)'
        $bucket | Should Match `
            '!startswith\(var\.name_prefix,\s*"amzn-s3-demo-"\)'
        $bucket | Should Match `
            'length\("\$\{var\.name_prefix\}-item-media-000000000000-\$\{var\.aws_region\}"\)\s*<=\s*63'
        $bucket | Should Match `
            'error_message\s*=\s*"[^"\r\n]*(?:lowercase|hyphen)[^"\r\n]*"'
        $bucket | Should Match `
            'error_message\s*=\s*"[^"\r\n]*63[^"\r\n]*"'

        $regexLiteral = [regex]::Match(
            $bucket,
            'can\(regex\("([^"\r\n]+)",\s*var\.name_prefix\)\)'
        ).Groups[1].Value
        $prefixPattern = '(?-i)' + $regexLiteral.Replace('\\', '\')

        foreach ($prefix in @('la', 'la-dev', 'a', 'a1-b2')) {
            $prefix | Should Match $prefixPattern
        }
        foreach ($prefix in @(
            'La',
            'la_dev',
            '-la',
            'la-',
            'la--dev'
        )) {
            $prefix | Should Not Match $prefixPattern
        }
    }

    It 'blocks every form of public access and enforces bucket ownership' {
        $publicAccess = Get-HclBlock $main `
            'resource\s+"aws_s3_bucket_public_access_block"\s+"media"'
        $ownership = Get-HclBlock $main `
            'resource\s+"aws_s3_bucket_ownership_controls"\s+"media"'

        foreach ($block in @($publicAccess, $ownership)) {
            $block | Should Match `
                'count\s*=\s*var\.enable_stage3\s*\?\s*1\s*:\s*0'
            $block | Should Match 'bucket\s*=\s*aws_s3_bucket\.media\[0\]\.id'
        }

        foreach ($flag in @(
            'block_public_acls',
            'block_public_policy',
            'ignore_public_acls',
            'restrict_public_buckets'
        )) {
            $publicAccess | Should Match "$flag\s*=\s*true"
        }
        $ownership | Should Match 'object_ownership\s*=\s*"BucketOwnerEnforced"'
        $all | Should Not Match 'resource\s+"aws_s3_bucket_(?:acl|policy)"'
    }

    It 'enables versioning and AES256 SSE-S3' {
        $versioning = Get-HclBlock $main `
            'resource\s+"aws_s3_bucket_versioning"\s+"media"'
        $encryption = Get-HclBlock $main `
            'resource\s+"aws_s3_bucket_server_side_encryption_configuration"\s+"media"'

        foreach ($block in @($versioning, $encryption)) {
            $block | Should Match `
                'count\s*=\s*var\.enable_stage3\s*\?\s*1\s*:\s*0'
            $block | Should Match 'bucket\s*=\s*aws_s3_bucket\.media\[0\]\.id'
        }

        $versioning | Should Match 'status\s*=\s*"Enabled"'
        $encryption | Should Match 'sse_algorithm\s*=\s*"AES256"'
        $encryption | Should Not Match 'kms_master_key_id|aws:kms'
    }

    It 'aborts incomplete multipart uploads after seven days' {
        $lifecycle = Get-HclBlock $main `
            'resource\s+"aws_s3_bucket_lifecycle_configuration"\s+"media"'

        $lifecycle | Should Match `
            'count\s*=\s*var\.enable_stage3\s*\?\s*1\s*:\s*0'
        $lifecycle | Should Match 'bucket\s*=\s*aws_s3_bucket\.media\[0\]\.id'
        $lifecycle | Should Match 'status\s*=\s*"Enabled"'
        $lifecycle | Should Match 'abort_incomplete_multipart_upload\s*\{'
        $lifecycle | Should Match 'days_after_initiation\s*=\s*7'
        $lifecycle | Should Match `
            'depends_on\s*=\s*\[\s*aws_s3_bucket_versioning\.media\s*\]'
    }

    It 'allows only browser upload and download CORS operations' {
        $cors = Get-HclBlock $main `
            'resource\s+"aws_s3_bucket_cors_configuration"\s+"media"'

        $cors | Should Match `
            'count\s*=\s*var\.enable_stage3\s*\?\s*1\s*:\s*0'
        $cors | Should Match 'bucket\s*=\s*aws_s3_bucket\.media\[0\]\.id'
        $cors | Should Match 'allowed_origins\s*=\s*var\.media_allowed_origins'
        $cors | Should Match `
            'allowed_methods\s*=\s*\[\s*"POST",\s*"GET"\s*\]'
        $cors | Should Match 'allowed_headers\s*=\s*\[\s*"Content-Type"\s*\]'
        $cors | Should Not Match '"\*"|allow_credentials|public-read|\bgrant\b'
        $cors | Should Not Match '"(?:PUT|DELETE|HEAD|PATCH)"'
    }
}

Describe 'Stage 3 data outputs and scope' {
    It 'returns null for every disabled Stage 3 output' {
        $expected = @{
            auction_catalog_table_name = `
                'aws_dynamodb_table\.auction_catalog\[0\]\.name'
            auction_catalog_table_arn = `
                'aws_dynamodb_table\.auction_catalog\[0\]\.arn'
            bidder_events_index_name = '"bidder_sub-sk-index"'
            media_bucket_name = 'aws_s3_bucket\.media\[0\]\.bucket'
            media_bucket_arn = 'aws_s3_bucket\.media\[0\]\.arn'
        }

        foreach ($name in $expected.Keys) {
            $output = Get-HclBlock $outputs "output\s+`"$name`""
            $output | Should Match (
                'value\s*=\s*var\.enable_stage3\s*\?\s*' +
                $expected[$name] + '\s*:\s*null'
            )
        }
    }

    It 'allows only the approved DynamoDB and S3 resource types' {
        $stage1Resources = @(
            'aws_dynamodb_table.item_auction_state',
            'aws_dynamodb_table.bid_events',
            'aws_dynamodb_table.websocket_connections',
            'aws_dynamodb_table.item_bidder_aliases',
            'aws_dynamodb_table.idempotency'
        )

        foreach ($match in [regex]::Matches(
            $all,
            'resource\s+"([^"]+)"\s+"([^"]+)"\s*\{'
        )) {
            $type = $match.Groups[1].Value
            $name = $match.Groups[2].Value
            $address = "$type.$name"

            $address | Should Match `
                '^aws_(?:dynamodb_(?:table|global_secondary_index)|s3_bucket(?:|_public_access_block|_ownership_controls|_versioning|_server_side_encryption_configuration|_lifecycle_configuration|_cors_configuration))\.[A-Za-z0-9_-]+$'

            if ($stage1Resources -notcontains $address) {
                $block = Get-HclBlock $all (
                    'resource\s+"' + [regex]::Escape($type) +
                    '"\s+"' + [regex]::Escape($name) + '"'
                )
                $block | Should Match `
                    'count\s*=\s*var\.enable_stage3\s*\?\s*1\s*:\s*0'
            }
        }
    }

    It 'allows only the gated caller identity data source' {
        foreach ($match in [regex]::Matches(
            $all,
            'data\s+"(aws_[^"]+)"\s+"([^"]+)"\s*\{'
        )) {
            "$($match.Groups[1].Value).$($match.Groups[2].Value)" |
                Should Match '^aws_caller_identity\.current$'
        }

        $caller = Get-HclBlock $all `
            'data\s+"aws_caller_identity"\s+"current"'
        $caller | Should Match `
            'count\s*=\s*var\.enable_stage3\s*\?\s*1\s*:\s*0'
    }

    It 'excludes all out-of-scope service families from every module file' {
        $all | Should Not Match `
            '(?i)(?:resource|data)\s+"aws_(?:lambda[^"\s]*|api_gateway[^"\s]*|apigatewayv2[^"\s]*|scheduler[^"\s]*|sqs[^"\s]*|sns[^"\s]*|eventbridge[^"\s]*|cloudwatch_event[^"\s]*|iam[^"\s]*|ecr[^"\s]*|ecs[^"\s]*|lb(?:_[^"\s]*)?|vpc[^"\s]*|subnet[^"\s]*|nat_gateway[^"\s]*|security_group[^"\s]*|rds[^"\s]*|db_[^"\s]*|elasticache[^"\s]*|kinesis[^"\s]*)"'
        $all | Should Not Match '(?i)aurora|vpc_config'
    }

    It 'keeps Stage 3 teardown possible throughout the module' {
        $all | Should Not Match '\bprevent_destroy\b'
    }
}
