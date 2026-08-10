param(
    [string]$Path = (Join-Path $PSScriptRoot '..\..\high_availability_live_auction_aws_2026_v2.drawio')
)

$ErrorActionPreference = 'Stop'

$resolvedPath = (Resolve-Path -LiteralPath $Path).Path
$document = [System.Xml.XmlDocument]::new()
$document.PreserveWhitespace = $true
$document.Load($resolvedPath)

$original = $document.SelectSingleNode('/mxfile/diagram[@name="Original - Before Review"]')
$page01 = $document.SelectSingleNode('/mxfile/diagram[@name="01 - Complete AWS System Design"]')
$catalog = $document.SelectSingleNode('/mxfile/diagram[@name="06 - AWS PNG Icon Catalog"]')
if ($null -eq $original) {
    throw 'Original - Before Review diagram page was not found.'
}
if ($null -eq $page01) {
    throw '01 - Complete AWS System Design diagram page was not found.'
}
if ($null -eq $catalog) {
    throw '06 - AWS PNG Icon Catalog diagram page was not found.'
}

$cells = $original.SelectSingleNode('mxGraphModel/root')
$page01Cells = $page01.SelectSingleNode('mxGraphModel/root')
$catalogCells = $catalog.SelectSingleNode('mxGraphModel/root')

function Get-Cell([string]$Id) {
    $cell = $cells.SelectSingleNode("mxCell[@id='$Id']")
    if ($null -eq $cell) {
        throw "Original page cell was not found: $Id"
    }
    return $cell
}

function Get-CatalogIconUri([string]$IconValue) {
    $cell = $catalogCells.SelectSingleNode("mxCell[@value='$IconValue']")
    if ($null -eq $cell) {
        throw "Catalog icon was not found: $IconValue"
    }

    $match = [regex]::Match([string]$cell.style, 'image=([^;]+);')
    if (-not $match.Success -or [string]::IsNullOrWhiteSpace($match.Groups[1].Value)) {
        throw "Catalog icon has no embedded image URI: $IconValue"
    }
    return $match.Groups[1].Value
}

function Set-CellValue([string]$Id, [string]$Value) {
    (Get-Cell $Id).SetAttribute('value', $Value)
}

function Set-CellStyle([string]$Id, [string]$Style) {
    (Get-Cell $Id).SetAttribute('style', $Style)
}

function Set-Page01CellValue([string]$Id, [string]$Value) {
    $cell = $page01Cells.SelectSingleNode("mxCell[@id='$Id']")
    if ($null -eq $cell) {
        throw "Page 01 cell was not found: $Id"
    }
    $cell.SetAttribute('value', $Value)
}

function Set-IconCell {
    param(
        [string]$Id,
        [string]$Value,
        [string]$IconValue,
        [int]$FontSize = 9,
        [switch]$Muted
    )

    $iconUri = Get-CatalogIconUri $IconValue
    $opacity = if ($Muted) { 'opacity=35;' } else { '' }
    $style = 'shape=image;image=' + $iconUri + ';aspect=fixed;imageAspect=0;html=1;align=center;verticalAlign=top;verticalLabelPosition=bottom;whiteSpace=wrap;spacingTop=4;spacingBottom=2;fontSize=' + $FontSize + ';fontColor=#232F3E;' + $opacity
    Set-CellValue $Id $Value
    Set-CellStyle $Id $style
}

function Set-EdgeValue([string]$Id, [string]$Value) {
    $edge = $cells.SelectSingleNode("mxCell[@id='$Id']")
    if ($null -eq $edge) {
        throw "Original page edge was not found: $Id"
    }
    $edge.SetAttribute('value', $Value)
}

function Set-EdgeEndpoints([string]$Id, [string]$Source, [string]$Target) {
    $edge = $cells.SelectSingleNode("mxCell[@id='$Id']")
    if ($null -eq $edge) {
        throw "Original page edge was not found: $Id"
    }
    $edge.SetAttribute('source', $Source)
    $edge.SetAttribute('target', $Target)
}

function Set-Marker {
    param(
        [string]$Id,
        [string]$Value,
        [double]$X,
        [double]$Y
    )

    $marker = Get-Cell $Id
    $marker.SetAttribute('value', $Value)
    $geometry = $marker.SelectSingleNode('mxGeometry')
    $geometry.SetAttribute('x', [string]$X)
    $geometry.SetAttribute('y', [string]$Y)
}

function Get-AbsoluteCellGeometry([string]$Id) {
    $cell = Get-Cell $Id
    $geometry = $cell.SelectSingleNode('mxGeometry')
    $x = [double]$geometry.GetAttribute('x')
    $y = [double]$geometry.GetAttribute('y')
    $width = [double]$geometry.GetAttribute('width')
    $height = [double]$geometry.GetAttribute('height')
    $parentId = $cell.GetAttribute('parent')

    while (-not [string]::IsNullOrWhiteSpace($parentId) -and $parentId -ne '1') {
        $parent = Get-Cell $parentId
        $parentGeometry = $parent.SelectSingleNode('mxGeometry')
        $x += [double]$parentGeometry.GetAttribute('x')
        $y += [double]$parentGeometry.GetAttribute('y')
        $parentId = $parent.GetAttribute('parent')
    }

    return [pscustomobject]@{
        X = $x
        Y = $y
        Width = $width
        Height = $height
    }
}

function Set-MarkerNearCell {
    param(
        [string]$Id,
        [string]$Value,
        [string]$CellId,
        [ValidateSet('top-left', 'top-right', 'left', 'right', 'bottom-left', 'bottom-right')]
        [string]$Anchor = 'top-left',
        [double]$Gap = 12
    )

    $target = Get-AbsoluteCellGeometry $CellId
    $markerGeometry = (Get-Cell $Id).SelectSingleNode('mxGeometry')
    $markerWidth = [double]$markerGeometry.GetAttribute('width')
    $markerHeight = [double]$markerGeometry.GetAttribute('height')

    switch ($Anchor) {
        'top-left' {
            $x = $target.X - $markerWidth - $Gap
            $y = $target.Y - $markerHeight - $Gap
        }
        'top-right' {
            $x = $target.X + $target.Width + $Gap
            $y = $target.Y - $markerHeight - $Gap
        }
        'left' {
            $x = $target.X - $markerWidth - $Gap
            $y = $target.Y + (($target.Height - $markerHeight) / 2)
        }
        'right' {
            $x = $target.X + $target.Width + $Gap
            $y = $target.Y + (($target.Height - $markerHeight) / 2)
        }
        'bottom-left' {
            $x = $target.X - $markerWidth - $Gap
            $y = $target.Y + $target.Height + $Gap
        }
        'bottom-right' {
            $x = $target.X + $target.Width + $Gap
            $y = $target.Y + $target.Height + $Gap
        }
    }

    Set-Marker $Id $Value $x $y
}

function Remove-Edge([string]$Id) {
    $edge = $cells.SelectSingleNode("mxCell[@id='$Id']")
    if ($null -ne $edge) {
        [void]$cells.RemoveChild($edge)
    }
}

Set-CellValue 'Hf92xAZXMRnNjoGPw4W6-2' 'Serverless Live Auction Platform on AWS<br>Singapore ap-southeast-1 | deployed resources | sequential items'
Set-CellValue 'Hf92xAZXMRnNjoGPw4W6-3' 'Client applications and edge entry'
Set-CellValue 'Hf92xAZXMRnNjoGPw4W6-31' 'Current CI/CD and Terraform IaC'
Set-CellValue 'Hf92xAZXMRnNjoGPw4W6-72' 'Primary Region: Singapore ap-southeast-1'
Set-CellValue 'Hf92xAZXMRnNjoGPw4W6-73' 'Deployed workload is regional and serverless. No VPC, subnet, AZ, NAT gateway, ECS, ALB, Aurora, Kinesis, or cross-region replica is active.'
Set-CellValue 'Hf92xAZXMRnNjoGPw4W6-144' '1 edge | 2 static app | 3 Cognito | 4 REST | 5 WSS | 6 placeBid | 7 FIFO | 8 bid processor/state | 9 broadcast<br>10 scheduler | 11 media | 12 connections | 13 records | 14 management API | 15 alarms | 16 audit/backup | A-C IaC/build | M1-M8 controls'
$legendGeometry = (Get-Cell 'Hf92xAZXMRnNjoGPw4W6-144').SelectSingleNode('mxGeometry')
$legendGeometry.SetAttribute('height', '52')
Set-CellStyle 'Hf92xAZXMRnNjoGPw4W6-144' 'text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;whiteSpace=wrap;fontSize=10;fontColor=#545B64;'

# The service image payloads are copied from page 6, so this page remains portable.
Set-IconCell 'Hf92xAZXMRnNjoGPw4W6-12' 'CloudFront distributions<br>client d1bt4phb59xk5x<br>admin d109et9edc4f35<br>media d2guc64amygnqt' 'Arch_Amazon-CloudFront_48' 9
Set-IconCell 'Hf92xAZXMRnNjoGPw4W6-32' 'Lambda versions and aliases<br>manual promotion target' 'Arch_AWS-Lambda_48' 9
Set-IconCell 'Hf92xAZXMRnNjoGPw4W6-34' 'Terraform remote state<br>S3 la-tfstate + DynamoDB la-tflock' 'Arch_Amazon-Simple-Storage-Service_48' 9
Set-IconCell 'Hf92xAZXMRnNjoGPw4W6-40' 'CodeBuild<br>la-build<br>test and package' 'Arch_AWS-CodeBuild_48' 9
Set-IconCell 'Hf92xAZXMRnNjoGPw4W6-41' 'S3 artifact bucket<br>la-cicd-artifacts-233376973052' 'Arch_Amazon-Simple-Storage-Service_48' 9

Set-IconCell 'Hf92xAZXMRnNjoGPw4W6-52' 'Cognito user pool<br>la-users | USER / ADMIN groups<br>Post Confirmation: la-cognito-post-confirm' 'Arch_Amazon-Cognito_48' 8
Set-IconCell 'Hf92xAZXMRnNjoGPw4W6-53' 'Lambda<br>la-bid-processor<br>FIFO validation + conditional update' 'Arch_AWS-Lambda_48' 9
Set-IconCell 'Hf92xAZXMRnNjoGPw4W6-54' 'Lambda<br>la-session-service<br>sessions, rules, schedule' 'Arch_AWS-Lambda_48' 9
Set-IconCell 'Hf92xAZXMRnNjoGPw4W6-55' 'API Gateway REST<br>la-control-plane /prod<br>session, item, query, admin Lambda routes<br>API key + Cognito JWT' 'Arch_Amazon-API-Gateway_48' 8
Set-IconCell 'Hf92xAZXMRnNjoGPw4W6-71' 'Lambda<br>la-broadcast<br>latest bid to item room' 'Arch_AWS-Lambda_48' 9
Set-IconCell 'Hf92xAZXMRnNjoGPw4W6-74' 'API Gateway WebSocket<br>la-websocket /prod<br>item room realtime' 'Arch_Amazon-API-Gateway_48' 9
Set-IconCell 'Hf92xAZXMRnNjoGPw4W6-75' 'Lambda<br>la-item-service<br>items + presigned media' 'Arch_AWS-Lambda_48' 9
Set-IconCell 'Hf92xAZXMRnNjoGPw4W6-76' 'Lambda<br>la-admin-command<br>pause, resume, approve, users' 'Arch_AWS-Lambda_48' 9
Set-IconCell 'Hf92xAZXMRnNjoGPw4W6-77' 'Lambda<br>la-ws-handler + la-ws-authorizer<br>connect, joinRoom, placeBid' 'Arch_AWS-Lambda_48' 8
Set-IconCell 'Hf92xAZXMRnNjoGPw4W6-82' 'S3 media bucket<br>la-item-media-233376973052-ap-southeast-1<br>private media via CloudFront' 'Arch_Amazon-Simple-Storage-Service_48' 8
Set-IconCell 'Hf92xAZXMRnNjoGPw4W6-88' 'EventBridge Scheduler<br>group la-scheduler<br>lifecycle watchdog' 'Arch_Amazon-EventBridge_48' 9
Set-IconCell 'Hf92xAZXMRnNjoGPw4W6-90' 'DynamoDB<br>la_websocket_connections<br>item_id + connection_id' 'Arch_Amazon-DynamoDB_48' 8
Set-IconCell 'Hf92xAZXMRnNjoGPw4W6-91' 'SQS FIFO<br>la-bid-commands.fifo<br>DLQ la-bid-commands-dlq.fifo' 'Arch_Amazon-Simple-Queue-Service_48' 8
Set-IconCell 'Hf92xAZXMRnNjoGPw4W6-95' 'DynamoDB catalog<br>la_auction_catalog<br>la_category_catalog<br>la_admin_audit_events' 'Arch_Amazon-DynamoDB_48' 8
Set-IconCell 'Hf92xAZXMRnNjoGPw4W6-98' 'DynamoDB state<br>la_item_auction_state<br>la_idempotency<br>la_item_bidder_aliases' 'Arch_Amazon-DynamoDB_48' 8
Set-IconCell 'Hf92xAZXMRnNjoGPw4W6-100' 'DynamoDB events<br>la_bid_events<br>audit and public history' 'Arch_Amazon-DynamoDB_48' 8
Set-IconCell 'Hf92xAZXMRnNjoGPw4W6-103' 'S3 client frontend<br>la-dev-frontend-233376973052<br>React build via CloudFront' 'Arch_Amazon-Simple-Storage-Service_48' 8

Set-IconCell 'Hf92xAZXMRnNjoGPw4W6-107' 'CloudWatch metrics and alarms<br>la-* error and latency alarms' 'Arch_Amazon-CloudWatch_48' 9
Set-IconCell 'Hf92xAZXMRnNjoGPw4W6-108' 'S3 admin frontend and CI artifacts<br>versioned private buckets' 'Arch_Amazon-Simple-Storage-Service_48' 8
Set-IconCell 'Hf92xAZXMRnNjoGPw4W6-109' 'S3 audit bucket<br>la-audit-233376973052<br>CloudTrail + Config logs' 'Arch_Amazon-Simple-Storage-Service_48' 8
Set-IconCell 'Hf92xAZXMRnNjoGPw4W6-110' 'AWS Backup<br>DynamoDB + S3 media recovery' 'Arch_AWS-Backup_48' 9
Set-IconCell 'Hf92xAZXMRnNjoGPw4W6-112' 'IAM Access Analyzer<br>account policy validation' 'Res_AWS-Identity-Access-Management_IAM-Access-Analyzer_48' 8
Set-IconCell 'Hf92xAZXMRnNjoGPw4W6-113' 'CloudTrail<br>management API events' 'Arch_AWS-CloudTrail_48' 9
Set-IconCell 'Hf92xAZXMRnNjoGPw4W6-114' 'IAM least privilege<br>Lambda and CI roles' 'Arch_AWS-Identity-and-Access-Management_32' 8
Set-IconCell 'Hf92xAZXMRnNjoGPw4W6-125' 'SNS<br>la-alarms<br>email notification' 'Arch_Amazon-Simple-Notification-Service_48' 9
Set-IconCell 'Hf92xAZXMRnNjoGPw4W6-126' 'CloudWatch Logs<br>Lambda and API access evidence' 'Arch_Amazon-CloudWatch_48' 8
Set-IconCell 'Hf92xAZXMRnNjoGPw4W6-127' 'AWS Config<br>serverless baseline rules' 'Arch_AWS-Config_32' 8

Set-CellValue 'Hf92xAZXMRnNjoGPw4W6-103' 'S3 client frontend<br>la-dev-frontend-233376973052<br>React build via CloudFront'
Set-CellValue 'Hf92xAZXMRnNjoGPw4W6-108' 'S3 admin frontend + CI artifacts<br>la-dev-admin-frontend / la-cicd-artifacts'

Set-EdgeValue 'Hf92xAZXMRnNjoGPw4W6-8' '1. client request'
Set-EdgeValue 'Hf92xAZXMRnNjoGPw4W6-9' '1. client request'
Set-EdgeValue 'Hf92xAZXMRnNjoGPw4W6-10' '1. client request'
Set-EdgeValue 'Hf92xAZXMRnNjoGPw4W6-15' '2. static app'
Set-EdgeValue 'Hf92xAZXMRnNjoGPw4W6-16' '8. FIFO event -> bid processor'
Set-EdgeValue 'Hf92xAZXMRnNjoGPw4W6-17' 'REST access logs'
Set-EdgeValue 'Hf92xAZXMRnNjoGPw4W6-18' 'WebSocket metrics'
Set-EdgeValue 'Hf92xAZXMRnNjoGPw4W6-19' 'bid metrics and errors'
Set-EdgeValue 'Hf92xAZXMRnNjoGPw4W6-23' 'SSE-S3 encryption'
Set-EdgeValue 'Hf92xAZXMRnNjoGPw4W6-25' 'AWS Backup selection'
Set-EdgeValue 'Hf92xAZXMRnNjoGPw4W6-38' 'source commit'
Set-EdgeValue 'Hf92xAZXMRnNjoGPw4W6-43' 'build and package'
Set-EdgeValue 'Hf92xAZXMRnNjoGPw4W6-44' 'publish Lambda version'
Set-EdgeEndpoints 'Hf92xAZXMRnNjoGPw4W6-44' 'Hf92xAZXMRnNjoGPw4W6-41' 'Hf92xAZXMRnNjoGPw4W6-32'
Set-EdgeValue 'Hf92xAZXMRnNjoGPw4W6-46' 'manual promotion'
Set-EdgeValue 'Hf92xAZXMRnNjoGPw4W6-48' 'frontend upload'
Set-EdgeValue 'Hf92xAZXMRnNjoGPw4W6-51' '3. Cognito sign-in'
Set-EdgeValue 'Hf92xAZXMRnNjoGPw4W6-56' '4. REST /prod'
Set-EdgeValue 'Hf92xAZXMRnNjoGPw4W6-57' '4a. session routes'
Set-EdgeValue 'Hf92xAZXMRnNjoGPw4W6-58' '4b. item and query routes'
Set-EdgeValue 'Hf92xAZXMRnNjoGPw4W6-59' '4c. admin routes'
Set-EdgeValue 'Hf92xAZXMRnNjoGPw4W6-60' '4d. catalog and category records'
Set-EdgeValue 'Hf92xAZXMRnNjoGPw4W6-66' '12. read room connections'
Set-EdgeValue 'Hf92xAZXMRnNjoGPw4W6-67' '9. invoke broadcast with bid outcome'
Set-EdgeValue 'Hf92xAZXMRnNjoGPw4W6-68' '8a. conditional state update'
Set-EdgeValue 'Hf92xAZXMRnNjoGPw4W6-69' '8b. append bid event'
Set-EdgeValue 'Hf92xAZXMRnNjoGPw4W6-78' '6. placeBid'
Set-EdgeValue 'Hf92xAZXMRnNjoGPw4W6-83' '11. presigned media upload'
Set-EdgeValue 'Hf92xAZXMRnNjoGPw4W6-89' '10. close / next item'
Set-EdgeValue 'Hf92xAZXMRnNjoGPw4W6-92' '6a. store room connection'
Set-EdgeValue 'Hf92xAZXMRnNjoGPw4W6-93' '7. enqueue bid command'
Set-EdgeValue 'Hf92xAZXMRnNjoGPw4W6-94' '14. post_to_connection via management API'
Set-EdgeEndpoints 'Hf92xAZXMRnNjoGPw4W6-94' 'Hf92xAZXMRnNjoGPw4W6-71' 'Hf92xAZXMRnNjoGPw4W6-74'
Set-EdgeValue 'Hf92xAZXMRnNjoGPw4W6-96' 'item records'
Set-EdgeValue 'Hf92xAZXMRnNjoGPw4W6-97' 'admin state transition'
Set-EdgeValue 'Hf92xAZXMRnNjoGPw4W6-105' '5. WSS /prod'
Set-EdgeValue 'Hf92xAZXMRnNjoGPw4W6-111' 'audit delivery'
Set-EdgeValue 'Hf92xAZXMRnNjoGPw4W6-128' 'ALARM'
Set-EdgeValue 'Hf92xAZXMRnNjoGPw4W6-129' 'log evidence'
Set-EdgeValue 'Hf92xAZXMRnNjoGPw4W6-130' 'Config snapshots'

# Remove two stale edges from the former diagram: broadcast never enqueues bids,
# and bid-processor does not own room-connection writes.
Remove-Edge 'Hf92xAZXMRnNjoGPw4W6-49'
Remove-Edge 'Hf92xAZXMRnNjoGPw4W6-70'

# Anchor every workflow marker to the service it describes. The helper resolves
# nested client cells into page coordinates before positioning the global marker.
# The client panel paints a white group background, so keep marker 1 just
# outside that panel beside the client-to-edge handoff.
Set-Marker 'Hf92xAZXMRnNjoGPw4W6-131' '1' 880 690
Set-MarkerNearCell 'Hf92xAZXMRnNjoGPw4W6-132' '2' 'Hf92xAZXMRnNjoGPw4W6-103' 'top-left'
Set-MarkerNearCell 'Hf92xAZXMRnNjoGPw4W6-133' '3' 'Hf92xAZXMRnNjoGPw4W6-52' 'top-left'
Set-MarkerNearCell 'Hf92xAZXMRnNjoGPw4W6-134' '4' 'Hf92xAZXMRnNjoGPw4W6-55' 'top-left'
Set-MarkerNearCell 'Hf92xAZXMRnNjoGPw4W6-135' '5' 'Hf92xAZXMRnNjoGPw4W6-74' 'top-left'
Set-MarkerNearCell 'Hf92xAZXMRnNjoGPw4W6-136' '6' 'Hf92xAZXMRnNjoGPw4W6-77' 'top-left'
Set-MarkerNearCell 'Hf92xAZXMRnNjoGPw4W6-137' '7' 'Hf92xAZXMRnNjoGPw4W6-91' 'top-left'
Set-MarkerNearCell 'Hf92xAZXMRnNjoGPw4W6-138' '8' 'Hf92xAZXMRnNjoGPw4W6-53' 'top-left'
Set-MarkerNearCell 'Hf92xAZXMRnNjoGPw4W6-139' '9' 'Hf92xAZXMRnNjoGPw4W6-71' 'top-left'
Set-MarkerNearCell 'Hf92xAZXMRnNjoGPw4W6-140' '10' 'Hf92xAZXMRnNjoGPw4W6-88' 'top-left'
Set-MarkerNearCell 'Hf92xAZXMRnNjoGPw4W6-147' '11' 'Hf92xAZXMRnNjoGPw4W6-82' 'top-left'
Set-MarkerNearCell 'Hf92xAZXMRnNjoGPw4W6-146' '12' 'Hf92xAZXMRnNjoGPw4W6-90' 'top-left'
Set-MarkerNearCell 'Hf92xAZXMRnNjoGPw4W6-148' '13' 'Hf92xAZXMRnNjoGPw4W6-98' 'top-left'
Set-MarkerNearCell 'Hf92xAZXMRnNjoGPw4W6-149' '14' 'Hf92xAZXMRnNjoGPw4W6-71' 'top-right'
Set-MarkerNearCell 'Hf92xAZXMRnNjoGPw4W6-145' '15' 'Hf92xAZXMRnNjoGPw4W6-107' 'top-left'
Set-MarkerNearCell 'Hf92xAZXMRnNjoGPw4W6-150' '16' 'Hf92xAZXMRnNjoGPw4W6-110' 'top-left'

# Keep the CI/CD markers on the actual handoff they describe.
Set-MarkerNearCell 'Hf92xAZXMRnNjoGPw4W6-141' 'A' 'Hf92xAZXMRnNjoGPw4W6-40' 'left'
Set-MarkerNearCell 'Hf92xAZXMRnNjoGPw4W6-142' 'B' 'Hf92xAZXMRnNjoGPw4W6-41' 'top-left'
Set-MarkerNearCell 'Hf92xAZXMRnNjoGPw4W6-143' 'C' 'Hf92xAZXMRnNjoGPw4W6-32' 'top-left'

# Keep the monitoring and security markers beside their corresponding controls.
Set-MarkerNearCell 'Hf92xAZXMRnNjoGPw4W6-155' 'M1' 'Hf92xAZXMRnNjoGPw4W6-107' 'left'
Set-MarkerNearCell 'Hf92xAZXMRnNjoGPw4W6-156' 'M2' 'Hf92xAZXMRnNjoGPw4W6-125' 'left'
Set-MarkerNearCell 'Hf92xAZXMRnNjoGPw4W6-157' 'M3' 'Hf92xAZXMRnNjoGPw4W6-126' 'left'
Set-MarkerNearCell 'Hf92xAZXMRnNjoGPw4W6-158' 'M4' 'Hf92xAZXMRnNjoGPw4W6-113' 'left'
Set-MarkerNearCell 'Hf92xAZXMRnNjoGPw4W6-159' 'M5' 'Hf92xAZXMRnNjoGPw4W6-127' 'left'
Set-MarkerNearCell 'Hf92xAZXMRnNjoGPw4W6-160' 'M6' 'Hf92xAZXMRnNjoGPw4W6-108' 'left'
Set-MarkerNearCell 'Hf92xAZXMRnNjoGPw4W6-161' 'M7' 'Hf92xAZXMRnNjoGPw4W6-109' 'left'
Set-MarkerNearCell 'Hf92xAZXMRnNjoGPw4W6-162' 'M8' 'Hf92xAZXMRnNjoGPw4W6-110' 'left'

# Page 01 is the copy used for the high-level architecture view. Keep only
# the AWS service name under each icon so the page stays readable at a glance.
$page01ServiceLabels = @{
    'Hf92xAZXMRnNjoGPw4W6-12' = 'CloudFront'
    'Hf92xAZXMRnNjoGPw4W6-32' = 'Lambda'
    'Hf92xAZXMRnNjoGPw4W6-34' = 'S3'
    'Hf92xAZXMRnNjoGPw4W6-40' = 'CodeBuild'
    'Hf92xAZXMRnNjoGPw4W6-41' = 'S3'
    'Hf92xAZXMRnNjoGPw4W6-52' = 'Cognito'
    'Hf92xAZXMRnNjoGPw4W6-53' = 'Lambda'
    'Hf92xAZXMRnNjoGPw4W6-54' = 'Lambda'
    'Hf92xAZXMRnNjoGPw4W6-55' = 'API Gateway'
    'Hf92xAZXMRnNjoGPw4W6-71' = 'Lambda'
    'Hf92xAZXMRnNjoGPw4W6-74' = 'API Gateway'
    'Hf92xAZXMRnNjoGPw4W6-75' = 'Lambda'
    'Hf92xAZXMRnNjoGPw4W6-76' = 'Lambda'
    'Hf92xAZXMRnNjoGPw4W6-77' = 'Lambda'
    'Hf92xAZXMRnNjoGPw4W6-82' = 'S3'
    'Hf92xAZXMRnNjoGPw4W6-88' = 'EventBridge'
    'Hf92xAZXMRnNjoGPw4W6-90' = 'DynamoDB'
    'Hf92xAZXMRnNjoGPw4W6-91' = 'SQS'
    'Hf92xAZXMRnNjoGPw4W6-95' = 'DynamoDB'
    'Hf92xAZXMRnNjoGPw4W6-98' = 'DynamoDB'
    'Hf92xAZXMRnNjoGPw4W6-100' = 'DynamoDB'
    'Hf92xAZXMRnNjoGPw4W6-103' = 'S3'
    'Hf92xAZXMRnNjoGPw4W6-107' = 'CloudWatch'
    'Hf92xAZXMRnNjoGPw4W6-108' = 'S3'
    'Hf92xAZXMRnNjoGPw4W6-109' = 'S3'
    'Hf92xAZXMRnNjoGPw4W6-110' = 'AWS Backup'
    'Hf92xAZXMRnNjoGPw4W6-112' = 'IAM Access Analyzer'
    'Hf92xAZXMRnNjoGPw4W6-113' = 'CloudTrail'
    'Hf92xAZXMRnNjoGPw4W6-114' = 'IAM'
    'Hf92xAZXMRnNjoGPw4W6-125' = 'SNS'
    'Hf92xAZXMRnNjoGPw4W6-126' = 'CloudWatch'
    'Hf92xAZXMRnNjoGPw4W6-127' = 'AWS Config'
}
foreach ($entry in $page01ServiceLabels.GetEnumerator()) {
    Set-Page01CellValue $entry.Key $entry.Value
}

$document.Save($resolvedPath)
Write-Output 'Updated Original - Before Review with deployed AWS resources and page 6 embedded icons.'
