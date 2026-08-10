param(
    [string]$Path = (Join-Path $PSScriptRoot '..\..\high_availability_live_auction_aws_2026_v2.drawio')
)

$ErrorActionPreference = 'Stop'

$resolvedPath = (Resolve-Path -LiteralPath $Path).Path
$document = [System.Xml.XmlDocument]::new()
$document.PreserveWhitespace = $true
$document.Load($resolvedPath)

# This script intentionally targets only the duplicated page, never page 01.
$copyPage = $document.SelectSingleNode('/mxfile/diagram[@name="Copy of 01 - Complete AWS System Design"]')
if ($null -eq $copyPage) {
    throw 'Copy of 01 - Complete AWS System Design page was not found.'
}

$root = $copyPage.SelectSingleNode('mxGraphModel/root')
function Set-IconLabel([string]$Id, [string]$Label) {
    $cell = $root.SelectSingleNode("mxCell[@id='$Id']")
    if ($null -eq $cell) {
        throw "Copy page icon cell was not found: $Id"
    }
    if ($cell.GetAttribute('style') -notmatch 'shape=image') {
        throw "Copy page cell is not an image icon: $Id"
    }
    $cell.SetAttribute('value', $Label)
}

$labels = [ordered]@{
    'cAbc-b5FqgfVzuVr1Rbt-10' = 'CloudFront'
    'cAbc-b5FqgfVzuVr1Rbt-21' = 'Lambda'
    'cAbc-b5FqgfVzuVr1Rbt-22' = 'Terraform'
    'cAbc-b5FqgfVzuVr1Rbt-25' = 'CodeBuild'
    'cAbc-b5FqgfVzuVr1Rbt-26' = 'S3'
    'cAbc-b5FqgfVzuVr1Rbt-32' = 'Cognito'
    'cAbc-b5FqgfVzuVr1Rbt-33' = 'Lambda'
    'cAbc-b5FqgfVzuVr1Rbt-34' = 'Lambda'
    'cAbc-b5FqgfVzuVr1Rbt-35' = 'API Gateway'
    'cAbc-b5FqgfVzuVr1Rbt-45' = 'Lambda'
    'cAbc-b5FqgfVzuVr1Rbt-47' = 'API Gateway'
    'cAbc-b5FqgfVzuVr1Rbt-48' = 'Lambda'
    'cAbc-b5FqgfVzuVr1Rbt-49' = 'Lambda'
    'cAbc-b5FqgfVzuVr1Rbt-50' = 'Lambda'
    'cAbc-b5FqgfVzuVr1Rbt-52' = 'S3'
    'cAbc-b5FqgfVzuVr1Rbt-54' = 'EventBridge'
    'cAbc-b5FqgfVzuVr1Rbt-56' = 'DynamoDB'
    'cAbc-b5FqgfVzuVr1Rbt-57' = 'SQS'
    'cAbc-b5FqgfVzuVr1Rbt-61' = 'DynamoDB'
    'cAbc-b5FqgfVzuVr1Rbt-64' = 'DynamoDB'
    'cAbc-b5FqgfVzuVr1Rbt-65' = 'DynamoDB'
    'cAbc-b5FqgfVzuVr1Rbt-66' = 'S3'
    'cAbc-b5FqgfVzuVr1Rbt-68' = 'CloudWatch'
    'cAbc-b5FqgfVzuVr1Rbt-69' = 'S3'
    'cAbc-b5FqgfVzuVr1Rbt-70' = 'S3'
    'cAbc-b5FqgfVzuVr1Rbt-71' = 'AWS Backup'
    'cAbc-b5FqgfVzuVr1Rbt-73' = 'IAM Access Analyzer'
    'cAbc-b5FqgfVzuVr1Rbt-74' = 'CloudTrail'
    'cAbc-b5FqgfVzuVr1Rbt-75' = 'IAM'
    'cAbc-b5FqgfVzuVr1Rbt-76' = 'SNS'
    'cAbc-b5FqgfVzuVr1Rbt-77' = 'CloudWatch Logs'
    'cAbc-b5FqgfVzuVr1Rbt-78' = 'AWS Config'
}

foreach ($entry in $labels.GetEnumerator()) {
    Set-IconLabel $entry.Key $entry.Value
}

$document.Save($resolvedPath)
Write-Output "Shortened $($labels.Count) icon labels on Copy of 01 only."
