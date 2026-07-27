$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$moduleRoot = Join-Path $repoRoot 'infra\09-edge'
$expectedFiles = @(
    'backend.tf',
    'versions.tf',
    'providers.tf',
    'variables.tf',
    'main.tf',
    'outputs.tf'
)

function Read-ModuleFile {
    param([string] $Name)
    Get-Content -Raw -LiteralPath (Join-Path $moduleRoot $Name)
}

function Read-AllTerraform {
    ($expectedFiles | ForEach-Object {
        if (Test-Path -LiteralPath (Join-Path $moduleRoot $_)) {
            Read-ModuleFile $_
        }
    }) -join "`n"
}

Describe 'Stage 4 edge static infrastructure contract' {
    It 'creates exactly the approved root Terraform files' {
        Test-Path -LiteralPath $moduleRoot | Should Be $true
        $files = @(Get-ChildItem -LiteralPath $moduleRoot -Filter '*.tf' -File |
            Select-Object -ExpandProperty Name |
            Sort-Object)
        ($files -join '|') | Should Be (($expectedFiles | Sort-Object) -join '|')
    }

    It 'uses the isolated backend key' {
        $backend = Read-ModuleFile 'backend.tf'
        $backend | Should Match 'backend\s+"s3"'
        $backend | Should Match 'key\s*=\s*"live-auction/stage4-edge/terraform\.tfstate"'
        $backend | Should Match 'region\s*=\s*"ap-southeast-1"'
        $backend | Should Match 'encrypt\s*=\s*true'
    }

    It 'locks Terraform, AWS provider, region, and common tags' {
        $versions = Read-ModuleFile 'versions.tf'
        $providers = Read-ModuleFile 'providers.tf'
        $variables = Read-ModuleFile 'variables.tf'

        $versions | Should Match 'required_version\s*=\s*">=\s*1\.7\.0'
        $versions | Should Match 'source\s*=\s*"hashicorp/aws"'
        $versions | Should Match 'version\s*=\s*"=\s*6\.55\.0"'
        $variables | Should Match 'variable\s+"aws_region"'
        $variables | Should Match 'default\s*=\s*"ap-southeast-1"'
        $providers | Should Match 'region\s*=\s*var\.aws_region'
        $providers | Should Match 'default_tags\s*\{'
        $providers | Should Match 'Project\s*=\s*var\.project'
        $providers | Should Match 'Environment\s*=\s*var\.environment'
        $providers | Should Match 'ManagedBy\s*=\s*"terraform"'
        $providers | Should Match 'Owner\s*=\s*var\.owner'
    }

    It 'defines the private, versioned, encrypted frontend S3 origin' {
        $main = Read-ModuleFile 'main.tf'

        $main | Should Match 'resource\s+"aws_s3_bucket"\s+"frontend"'
        $main | Should Match 'resource\s+"aws_s3_bucket_versioning"\s+"frontend"'
        $main | Should Match 'status\s*=\s*"Enabled"'
        $main | Should Match 'resource\s+"aws_s3_bucket_server_side_encryption_configuration"\s+"frontend"'
        $main | Should Match 'sse_algorithm\s*=\s*"AES256"'
        $main | Should Match 'resource\s+"aws_s3_bucket_public_access_block"\s+"frontend"'
        foreach ($setting in @(
            'block_public_acls',
            'block_public_policy',
            'ignore_public_acls',
            'restrict_public_buckets'
        )) {
            $main | Should Match ($setting + '\s*=\s*true')
        }
    }

    It 'defines CloudFront OAC with HTTPS redirect and GET/HEAD only' {
        $main = Read-ModuleFile 'main.tf'

        $main | Should Match 'resource\s+"aws_cloudfront_origin_access_control"\s+"frontend"'
        $main | Should Match 'origin_access_control_origin_type\s*=\s*"s3"'
        $main | Should Match 'signing_behavior\s*=\s*"always"'
        $main | Should Match 'signing_protocol\s*=\s*"sigv4"'
        $main | Should Match 'resource\s+"aws_cloudfront_distribution"\s+"frontend"'
        $main | Should Match 'origin_access_control_id\s*=\s*aws_cloudfront_origin_access_control\.frontend\.id'
        $main | Should Match 'viewer_protocol_policy\s*=\s*"redirect-to-https"'
        $main | Should Match 'allowed_methods\s*=\s*\[\s*"GET",\s*"HEAD"\s*\]'
        $main | Should Match 'cached_methods\s*=\s*\[\s*"GET",\s*"HEAD"\s*\]'
    }

    It 'scopes the bucket policy to the CloudFront distribution OAC principal' {
        $main = Read-ModuleFile 'main.tf'

        $main | Should Match 'resource\s+"aws_s3_bucket_policy"\s+"frontend"'
        $main | Should Match 'Service\s*=\s*"cloudfront\.amazonaws\.com"'
        $main | Should Match 'AWS:SourceArn'
        $main | Should Match 'aws_cloudfront_distribution\.frontend\.arn'
        $main | Should Match 's3:GetObject'
        $main | Should Match '\$\{aws_s3_bucket\.frontend\.arn\}/\*"'
    }

    It 'maps SPA 403 and 404 errors to index.html response 200 without caching errors' {
        $main = Read-ModuleFile 'main.tf'

        foreach ($code in @('403', '404')) {
            $main | Should Match ('error_code\s*=\s*' + $code)
        }
        $fallbackCount = ([regex]::Matches($main, 'response_page_path\s*=\s*"/index\.html"')).Count
        $responseCount = ([regex]::Matches($main, 'response_code\s*=\s*200')).Count
        $ttlCount = ([regex]::Matches($main, 'error_caching_min_ttl\s*=\s*0')).Count
        $fallbackCount | Should Be 2
        $responseCount | Should Be 2
        $ttlCount | Should Be 2
    }

    It 'exports only finite non-secret handoff outputs' {
        $outputs = Read-ModuleFile 'outputs.tf'
        $names = @([regex]::Matches($outputs, 'output\s+"([^"]+)"') |
            ForEach-Object { $_.Groups[1].Value } |
            Sort-Object)

        ($names -join '|') | Should Be 'cloudfront_distribution_id|cloudfront_domain_name|cloudfront_origin|frontend_bucket_name'
        $outputs | Should Match 'frontend_bucket_name[\s\S]*value\s*=\s*aws_s3_bucket\.frontend\.bucket'
        $outputs | Should Match 'cloudfront_distribution_id[\s\S]*value\s*=\s*aws_cloudfront_distribution\.frontend\.id'
        $outputs | Should Match 'cloudfront_domain_name[\s\S]*value\s*=\s*aws_cloudfront_distribution\.frontend\.domain_name'
        $outputs | Should Match 'cloudfront_origin[\s\S]*value\s*=\s*"https://\$\{aws_cloudfront_distribution\.frontend\.domain_name\}"'
        $outputs | Should Not Match 'sensitive\s*=\s*true'
        $outputs | Should Not Match '(?i)(secret|token|credential|password|api[_-]?key|access[_-]?key)'
    }

    It 'contains no forbidden edge-adjacent or compute/database resources' {
        $all = Read-AllTerraform
        $all | Should Not Match 'resource\s+"aws_wafv2_'
        $all | Should Not Match 'resource\s+"aws_route53_'
        $all | Should Not Match 'resource\s+"aws_acm_'
        $all | Should Not Match 'resource\s+"aws_lambda_'
        $all | Should Not Match 'resource\s+"aws_api_gateway'
        $all | Should Not Match 'resource\s+"aws_apigatewayv2_'
        $all | Should Not Match 'resource\s+"aws_vpc"'
        $all | Should Not Match 'resource\s+"aws_ecs_'
        $all | Should Not Match 'resource\s+"aws_rds_'
        $all | Should Not Match 'resource\s+"aws_db_'
    }
}
