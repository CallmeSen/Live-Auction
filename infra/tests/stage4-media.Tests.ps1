$root = Split-Path -Parent $PSScriptRoot
$edge = Get-Content (Join-Path $root '09-edge/main.tf') -Raw
$outputs = Get-Content (Join-Path $root '09-edge/outputs.tf') -Raw

Describe 'Stage 4 media delivery' {
    It 'reads the existing private media bucket from the data stack' {
        $edge | Should Match 'terraform_remote_state" "data"'
        $edge | Should Match '04-data/terraform\.tfstate'
        $edge | Should Match 'media_bucket_name'
        $edge | Should Match 'aws_s3_bucket" "media"'
    }

    It 'uses a dedicated CloudFront OAC and GET-only media distribution' {
        $edge | Should Match 'cloudfront_origin_access_control" "media"'
        $edge | Should Match 'origin_access_control_origin_type\s*=\s*"s3"'
        $edge | Should Match 'signing_behavior\s*=\s*"always"'
        $edge | Should Match 'cloudfront_distribution" "media"'
        $edge | Should Match 'allowed_methods\s*=\s*\["GET", "HEAD"\]'
        $edge | Should Match 'cached_methods\s*=\s*\["GET", "HEAD"\]'
    }

    It 'allows only the media CloudFront distribution to read objects' {
        $edge | Should Match 's3_bucket_policy" "media"'
        $edge | Should Match 'Service\s*=\s*"cloudfront\.amazonaws\.com"'
        $edge | Should Match 'Action\s*=\s*"s3:GetObject"'
        $edge | Should Match 'aws_cloudfront_distribution\.media\.arn'
        $edge | Should Not Match '(?i)Principal\s*=\s*"\*"'
    }

    It 'exports the media origin and distribution id' {
        $outputs | Should Match 'output\s+"media_cloudfront_distribution_id"'
        $outputs | Should Match 'output\s+"media_cloudfront_domain_name"'
        $outputs | Should Match 'output\s+"media_cloudfront_origin"'
    }
}
