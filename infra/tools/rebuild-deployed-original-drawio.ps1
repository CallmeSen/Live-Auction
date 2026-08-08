param(
    [string]$Path = (Join-Path $PSScriptRoot '..\..\high_availability_live_auction_aws_2026_v2.drawio')
)

$ErrorActionPreference = 'Stop'

$resolvedPath = (Resolve-Path -LiteralPath $Path).Path
$document = [System.Xml.XmlDocument]::new()
$document.PreserveWhitespace = $true
$document.Load($resolvedPath)

$originalName = 'Original - Before Review'
$catalogName = '06 - AWS PNG Icon Catalog'
$originalPage = $document.SelectSingleNode("/mxfile/diagram[@name='$originalName']")
$catalogPage = $document.SelectSingleNode("/mxfile/diagram[@name='$catalogName']")
if ($null -eq $originalPage) {
    throw "Diagram page was not found: $originalName"
}
if ($null -eq $catalogPage) {
    throw "Icon catalog page was not found: $catalogName"
}

$catalogCells = @(
    $catalogPage.SelectNodes('mxGraphModel/root/mxCell') |
        Where-Object { ([string]$_.id) -like 'aws-png-icon-*' }
)

function Get-CatalogImageStyle {
    param([string]$Needle)

    $match = $catalogCells |
        Where-Object { ([string]$_.tooltip -like "*$Needle*") -or ([string]$_.value -like "*$Needle*") } |
        Select-Object -First 1
    if ($null -eq $match) {
        throw "Icon was not found on ${catalogName}: $Needle"
    }

    $catalogStyle = [string]$match.style
    $image = ([regex]::Match($catalogStyle, 'image=(data:image/png%3Bbase64,[^;]+);')).Groups[1].Value
    if ([string]::IsNullOrWhiteSpace($image)) {
        throw "Catalog icon is not embedded as a PNG data URI: $Needle"
    }

    return "shape=image;image=$image;aspect=fixed;html=1;align=center;verticalAlign=top;verticalLabelPosition=bottom;whiteSpace=wrap;fontSize=10;fontColor=#232F3E;spacingTop=4;spacingBottom=2;"
}

$icons = @{
    ApiGateway    = Get-CatalogImageStyle 'Arch_Amazon-API-Gateway_32'
    Backup        = Get-CatalogImageStyle 'Arch_AWS-Backup_32'
    Build         = Get-CatalogImageStyle 'Arch_AWS-CodeBuild_32'
    CloudFront    = Get-CatalogImageStyle 'Arch_Amazon-CloudFront_32'
    CloudTrail    = Get-CatalogImageStyle 'Arch_AWS-CloudTrail_32'
    CloudWatch    = Get-CatalogImageStyle 'Arch_Amazon-CloudWatch_32'
    Cognito       = Get-CatalogImageStyle 'Arch_Amazon-Cognito_32'
    Config        = Get-CatalogImageStyle 'Arch_AWS-Config_32'
    DynamoDB      = Get-CatalogImageStyle 'Arch_Amazon-DynamoDB_32'
    EventBridge   = Get-CatalogImageStyle 'Arch_Amazon-EventBridge_32'
    Iam           = Get-CatalogImageStyle 'Arch_AWS-Identity-and-Access-Management_32'
    Lambda        = Get-CatalogImageStyle 'Arch_AWS-Lambda_32'
    S3            = Get-CatalogImageStyle 'Arch_Amazon-Simple-Storage-Service_32'
    Sns           = Get-CatalogImageStyle 'Arch_Amazon-Simple-Notification-Service_32'
    Sqs           = Get-CatalogImageStyle 'Arch_Amazon-Simple-Queue-Service_32'
    AccessAnalyzer = Get-CatalogImageStyle 'Res_AWS-Identity-Access-Management_IAM-Access-Analyzer_48'
}

$originalId = [string]$originalPage.id
$page = $document.CreateElement('diagram')
$page.SetAttribute('id', $originalId)
$page.SetAttribute('name', $originalName)

$model = $document.CreateElement('mxGraphModel')
foreach ($attribute in @{
    dx = '2400'
    dy = '1600'
    grid = '1'
    gridSize = '10'
    guides = '1'
    tooltips = '1'
    connect = '1'
    arrows = '1'
    fold = '1'
    page = '1'
    pageScale = '1'
    pageWidth = '3200'
    pageHeight = '2260'
    math = '0'
    shadow = '0'
}.GetEnumerator()) {
    $model.SetAttribute($attribute.Key, $attribute.Value)
}

$root = $document.CreateElement('root')
$model.AppendChild($root) | Out-Null
$page.AppendChild($model) | Out-Null

$rootCell = $document.CreateElement('mxCell')
$rootCell.SetAttribute('id', '0')
$root.AppendChild($rootCell) | Out-Null

$layerCell = $document.CreateElement('mxCell')
$layerCell.SetAttribute('id', '1')
$layerCell.SetAttribute('parent', '0')
$root.AppendChild($layerCell) | Out-Null

function Add-Geometry {
    param(
        [System.Xml.XmlElement]$Cell,
        [double]$X,
        [double]$Y,
        [double]$Width,
        [double]$Height,
        [bool]$Relative = $false
    )

    $geometry = $document.CreateElement('mxGeometry')
    if ($Relative) {
        $geometry.SetAttribute('relative', '1')
    } else {
        $geometry.SetAttribute('x', [string]$X)
        $geometry.SetAttribute('y', [string]$Y)
        $geometry.SetAttribute('width', [string]$Width)
        $geometry.SetAttribute('height', [string]$Height)
    }
    $geometry.SetAttribute('as', 'geometry')
    $Cell.AppendChild($geometry) | Out-Null
}

function Add-Text {
    param(
        [string]$Id,
        [string]$Value,
        [double]$X,
        [double]$Y,
        [double]$Width,
        [double]$Height,
        [string]$Style = 'text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;whiteSpace=wrap;fontSize=12;fontColor=#232F3E;',
        [string]$Parent = '1'
    )

    $cell = $document.CreateElement('mxCell')
    $cell.SetAttribute('id', $Id)
    $cell.SetAttribute('parent', $Parent)
    $cell.SetAttribute('style', $Style)
    $cell.SetAttribute('value', $Value)
    $cell.SetAttribute('vertex', '1')
    Add-Geometry -Cell $cell -X $X -Y $Y -Width $Width -Height $Height
    $root.AppendChild($cell) | Out-Null
}

function Add-Container {
    param(
        [string]$Id,
        [string]$Value,
        [double]$X,
        [double]$Y,
        [double]$Width,
        [double]$Height,
        [string]$FillColor = '#F7F9FA',
        [string]$StrokeColor = '#8796A5'
    )

    $style = "swimlane;html=1;rounded=1;startSize=34;horizontal=1;swimlaneLine=0;collapsible=0;whiteSpace=wrap;fontStyle=1;fontSize=14;fontColor=#16191F;fillColor=$FillColor;strokeColor=$StrokeColor;"
    $cell = $document.CreateElement('mxCell')
    $cell.SetAttribute('id', $Id)
    $cell.SetAttribute('parent', '1')
    $cell.SetAttribute('style', $style)
    $cell.SetAttribute('value', $Value)
    $cell.SetAttribute('vertex', '1')
    Add-Geometry -Cell $cell -X $X -Y $Y -Width $Width -Height $Height
    $root.AppendChild($cell) | Out-Null
    return $Id
}

function Add-Node {
    param(
        [string]$Id,
        [string]$Value,
        [double]$X,
        [double]$Y,
        [double]$Width,
        [double]$Height,
        [string]$Parent,
        [string]$Style = '',
        [string]$Tooltip = ''
    )

    if ([string]::IsNullOrWhiteSpace($Style)) {
        $Style = 'rounded=1;whiteSpace=wrap;html=1;align=center;verticalAlign=middle;spacing=8;fontSize=12;fontColor=#16191F;fillColor=#FFFFFF;strokeColor=#8796A5;'
    }

    $cell = $document.CreateElement('mxCell')
    $cell.SetAttribute('id', $Id)
    $cell.SetAttribute('parent', $Parent)
    $cell.SetAttribute('style', $Style)
    $cell.SetAttribute('value', $Value)
    if (-not [string]::IsNullOrWhiteSpace($Tooltip)) {
        $cell.SetAttribute('tooltip', $Tooltip)
    }
    $cell.SetAttribute('vertex', '1')
    Add-Geometry -Cell $cell -X $X -Y $Y -Width $Width -Height $Height
    $root.AppendChild($cell) | Out-Null
}

function Add-Edge {
    param(
        [string]$Id,
        [string]$Source,
        [string]$Target,
        [string]$Value = '',
        [string]$Color = '#4B5563',
        [bool]$Dashed = $false,
        [string]$StartArrow = 'none',
        [string]$EndArrow = 'block'
    )

    $dash = if ($Dashed) { 'dashed=1;dashPattern=8 6;' } else { 'dashed=0;' }
    $style = "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=$Color;strokeWidth=1.5;$dash;startArrow=$StartArrow;endArrow=$EndArrow;fontSize=10;fontColor=#374151;labelBackgroundColor=#FFFFFF;"
    $cell = $document.CreateElement('mxCell')
    $cell.SetAttribute('id', $Id)
    $cell.SetAttribute('parent', '1')
    $cell.SetAttribute('style', $style)
    $cell.SetAttribute('value', $Value)
    $cell.SetAttribute('source', $Source)
    $cell.SetAttribute('target', $Target)
    $cell.SetAttribute('edge', '1')
    Add-Geometry -Cell $cell -X 0 -Y 0 -Width 0 -Height 0 -Relative $true
    $root.AppendChild($cell) | Out-Null
}

Add-Text `
    -Id 'deployed-title' `
    -Value 'Live Auction Platform | Deployed AWS Architecture' `
    -X 40 -Y 20 -Width 3120 -Height 42 `
    -Style 'text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;whiteSpace=wrap;fontSize=24;fontStyle=1;fontColor=#16191F;'

Add-Text `
    -Id 'deployed-subtitle' `
    -Value 'Account 233376973052 | Region ap-southeast-1 | Terraform-managed | serverless regional runtime | icon source: page 6' `
    -X 40 -Y 66 -Width 3120 -Height 26 `
    -Style 'text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;whiteSpace=wrap;fontSize=12;fontColor=#545B64;'

$edgeBand = Add-Container -Id 'band-edge' -Value '1. Client and Edge' -X 40 -Y 120 -Width 3120 -Height 300 -FillColor '#F3F8FF' -StrokeColor '#7AA7D9'
$apiBand = Add-Container -Id 'band-api' -Value '2. Identity and API Gateway' -X 40 -Y 440 -Width 3120 -Height 300 -FillColor '#FFF8ED' -StrokeColor '#D99B3D'
$runtimeBand = Add-Container -Id 'band-runtime' -Value '3. Serverless Runtime and Async Processing' -X 40 -Y 760 -Width 3120 -Height 500 -FillColor '#F4FBF6' -StrokeColor '#65A97A'
$dataBand = Add-Container -Id 'band-data' -Value '4. Data and Media' -X 40 -Y 1280 -Width 3120 -Height 430 -FillColor '#FFF7F0' -StrokeColor '#D99B3D'
$opsBand = Add-Container -Id 'band-ops' -Value '5. Observability, Security, Backup and IaC' -X 40 -Y 1730 -Width 3120 -Height 440 -FillColor '#F8F5FF' -StrokeColor '#8D75C7'

$actorStyle = 'rounded=1;whiteSpace=wrap;html=1;align=center;verticalAlign=middle;fontSize=12;fontStyle=1;fontColor=#16191F;fillColor=#FFFFFF;strokeColor=#5B6B7A;'
Add-Node -Id 'bidder-browser' -Value 'Bidder / Seller browser<br>React client' -X 35 -Y 55 -Width 190 -Height 78 -Parent $edgeBand -Style $actorStyle
Add-Node -Id 'admin-browser' -Value 'Admin dashboard<br>React admin app' -X 35 -Y 165 -Width 190 -Height 78 -Parent $edgeBand -Style $actorStyle
Add-Node -Id 'cf-client' -Value 'CloudFront<br>d1bt4phb59xk5x' -X 280 -Y 55 -Width 190 -Height 95 -Parent $edgeBand -Style $icons.CloudFront
Add-Node -Id 's3-client' -Value 'S3 frontend<br>la-dev-frontend' -X 535 -Y 55 -Width 190 -Height 95 -Parent $edgeBand -Style $icons.S3
Add-Node -Id 'cf-admin' -Value 'CloudFront<br>d109et9edc4f35' -X 280 -Y 165 -Width 190 -Height 95 -Parent $edgeBand -Style $icons.CloudFront
Add-Node -Id 's3-admin' -Value 'S3 admin frontend<br>la-dev-admin-frontend' -X 535 -Y 165 -Width 190 -Height 95 -Parent $edgeBand -Style $icons.S3
Add-Node -Id 'cf-media' -Value 'CloudFront media<br>d2guc64amygnqt' -X 800 -Y 110 -Width 190 -Height 95 -Parent $edgeBand -Style $icons.CloudFront
Add-Node -Id 's3-media' -Value 'S3 private media<br>la-item-media' -X 1055 -Y 110 -Width 190 -Height 95 -Parent $edgeBand -Style $icons.S3
Add-Text -Id 'edge-note' -Value 'HTTPS static delivery and media read path<br>Presigned upload targets the private media bucket' -X 1330 -Y 85 -Width 720 -Height 90 -Parent $edgeBand -Style 'text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;whiteSpace=wrap;fontSize=13;fontColor=#374151;'

Add-Node -Id 'cognito' -Value 'Cognito user pool<br>la-users<br>USER / ADMIN groups' -X 45 -Y 70 -Width 220 -Height 120 -Parent $apiBand -Style $icons.Cognito -Tooltip 'ap-southeast-1_1Ly454wiD'
Add-Node -Id 'post-confirm' -Value 'Lambda<br>la-cognito-post-confirm<br>assign USER group' -X 330 -Y 70 -Width 220 -Height 120 -Parent $apiBand -Style $icons.Lambda
Add-Node -Id 'rest-api' -Value 'API Gateway REST<br>la-control-plane<br>/prod + API key + JWT' -X 620 -Y 70 -Width 230 -Height 120 -Parent $apiBand -Style $icons.ApiGateway -Tooltip 'REST API 6yqgy3qadf'
Add-Node -Id 'websocket-api' -Value 'API Gateway WebSocket<br>la-websocket<br>connect / joinRoom / placeBid' -X 920 -Y 70 -Width 250 -Height 120 -Parent $apiBand -Style $icons.ApiGateway -Tooltip 'WebSocket API 4p8740wwoe'
Add-Node -Id 'iam-roles' -Value 'IAM execution roles<br>scoped Lambda and service permissions' -X 1240 -Y 70 -Width 230 -Height 120 -Parent $apiBand -Style $icons.Iam
Add-Text -Id 'api-note' -Value 'All deployed API and Lambda workloads are regional/serverless.<br>No VPC, subnet, AZ, NAT gateway, ECS, ALB, Aurora or Kinesis.' -X 1540 -Y 75 -Width 1240 -Height 105 -Parent $apiBand -Style 'text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;whiteSpace=wrap;fontSize=13;fontColor=#374151;'

$lambdaStyle = $icons.Lambda
Add-Node -Id 'session-service' -Value 'la-session-service<br>sessions, rules, schedule' -X 35 -Y 55 -Width 225 -Height 105 -Parent $runtimeBand -Style $lambdaStyle
Add-Node -Id 'item-service' -Value 'la-item-service<br>items, image upload, sequence' -X 300 -Y 55 -Width 225 -Height 105 -Parent $runtimeBand -Style $lambdaStyle
Add-Node -Id 'query-service' -Value 'la-query-service<br>catalog, categories, public reads' -X 565 -Y 55 -Width 225 -Height 105 -Parent $runtimeBand -Style $lambdaStyle
Add-Node -Id 'admin-command' -Value 'la-admin-command<br>admin control plane, audit, users' -X 830 -Y 55 -Width 225 -Height 105 -Parent $runtimeBand -Style $lambdaStyle
Add-Node -Id 'ws-authorizer' -Value 'la-ws-authorizer<br>JWT connection authorization' -X 1095 -Y 55 -Width 225 -Height 105 -Parent $runtimeBand -Style $lambdaStyle
Add-Node -Id 'ws-handler' -Value 'la-ws-handler<br>connect, join room, place bid' -X 1360 -Y 55 -Width 225 -Height 105 -Parent $runtimeBand -Style $lambdaStyle
Add-Node -Id 'bid-processor' -Value 'la-bid-processor<br>FIFO ordered validation + state update' -X 1625 -Y 55 -Width 225 -Height 105 -Parent $runtimeBand -Style $lambdaStyle
Add-Node -Id 'broadcast' -Value 'la-broadcast<br>send latest bid to item room' -X 1890 -Y 55 -Width 225 -Height 105 -Parent $runtimeBand -Style $lambdaStyle
Add-Node -Id 'bid-queue' -Value 'SQS FIFO<br>la-bid-commands.fifo' -X 1030 -Y 265 -Width 210 -Height 105 -Parent $runtimeBand -Style $icons.Sqs
Add-Node -Id 'bid-dlq' -Value 'SQS FIFO DLQ<br>la-bid-commands-dlq.fifo' -X 1300 -Y 265 -Width 220 -Height 105 -Parent $runtimeBand -Style $icons.Sqs
Add-Node -Id 'scheduler' -Value 'EventBridge Scheduler<br>la-scheduler<br>lifecycle watchdog' -X 1580 -Y 265 -Width 230 -Height 105 -Parent $runtimeBand -Style $icons.EventBridge
Add-Node -Id 'scheduler-dlq' -Value 'SQS DLQ<br>la-scheduler-dlq' -X 1870 -Y 265 -Width 210 -Height 105 -Parent $runtimeBand -Style $icons.Sqs
Add-Text -Id 'runtime-note' -Value 'Runtime is split by bounded service responsibility; bid ordering is enforced by MessageGroupId = item_id and DynamoDB conditional writes.' -X 2140 -Y 260 -Width 850 -Height 115 -Parent $runtimeBand -Style 'text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;whiteSpace=wrap;fontSize=13;fontColor=#374151;'

$tableStyle = $icons.DynamoDB
Add-Node -Id 'tbl-catalog' -Value 'DynamoDB<br>la_auction_catalog<br>sessions, items' -X 35 -Y 55 -Width 220 -Height 105 -Parent $dataBand -Style $tableStyle
Add-Node -Id 'tbl-category' -Value 'DynamoDB<br>la_category_catalog<br>categories' -X 285 -Y 55 -Width 220 -Height 105 -Parent $dataBand -Style $tableStyle
Add-Node -Id 'tbl-state' -Value 'DynamoDB<br>la_item_auction_state<br>current price, end time' -X 535 -Y 55 -Width 220 -Height 105 -Parent $dataBand -Style $tableStyle
Add-Node -Id 'tbl-bids' -Value 'DynamoDB<br>la_bid_events<br>audit and history' -X 785 -Y 55 -Width 220 -Height 105 -Parent $dataBand -Style $tableStyle
Add-Node -Id 'tbl-connections' -Value 'DynamoDB<br>la_websocket_connections<br>item room connections' -X 35 -Y 190 -Width 220 -Height 105 -Parent $dataBand -Style $tableStyle
Add-Node -Id 'tbl-aliases' -Value 'DynamoDB<br>la_item_bidder_aliases<br>bidder aliases' -X 285 -Y 190 -Width 220 -Height 105 -Parent $dataBand -Style $tableStyle
Add-Node -Id 'tbl-idempotency' -Value 'DynamoDB<br>la_idempotency<br>request dedupe' -X 535 -Y 190 -Width 220 -Height 105 -Parent $dataBand -Style $tableStyle
Add-Node -Id 'tbl-admin-audit' -Value 'DynamoDB<br>la_admin_audit_events<br>admin history' -X 785 -Y 190 -Width 220 -Height 105 -Parent $dataBand -Style $tableStyle
Add-Node -Id 'bucket-media' -Value 'S3<br>la-item-media<br>private versioned objects' -X 1120 -Y 105 -Width 220 -Height 105 -Parent $dataBand -Style $icons.S3
Add-Node -Id 'bucket-audit' -Value 'S3<br>la-audit<br>CloudTrail + Config logs' -X 1380 -Y 105 -Width 220 -Height 105 -Parent $dataBand -Style $icons.S3
Add-Node -Id 'bucket-artifacts' -Value 'S3<br>la-cicd-artifacts<br>versioned build artifacts' -X 1640 -Y 105 -Width 220 -Height 105 -Parent $dataBand -Style $icons.S3
Add-Node -Id 'bucket-tfstate' -Value 'S3<br>la-tfstate<br>encrypted Terraform state' -X 1900 -Y 105 -Width 220 -Height 105 -Parent $dataBand -Style $icons.S3
Add-Text -Id 'data-note' -Value 'DynamoDB is the system of record for auction state and ordered bid history. S3 media remains private and is served through CloudFront.' -X 2170 -Y 90 -Width 820 -Height 150 -Parent $dataBand -Style 'text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;whiteSpace=wrap;fontSize=13;fontColor=#374151;'

Add-Node -Id 'cloudwatch' -Value 'CloudWatch<br>logs, metrics, alarms' -X 35 -Y 65 -Width 220 -Height 110 -Parent $opsBand -Style $icons.CloudWatch
Add-Node -Id 'sns' -Value 'SNS<br>la-alarms<br>operator notifications' -X 295 -Y 65 -Width 220 -Height 110 -Parent $opsBand -Style $icons.Sns
Add-Node -Id 'cloudtrail' -Value 'CloudTrail<br>API audit events' -X 555 -Y 65 -Width 220 -Height 110 -Parent $opsBand -Style $icons.CloudTrail
Add-Node -Id 'config' -Value 'AWS Config<br>baseline rules and snapshots' -X 815 -Y 65 -Width 220 -Height 110 -Parent $opsBand -Style $icons.Config
Add-Node -Id 'access-analyzer' -Value 'IAM Access Analyzer<br>policy validation' -X 1075 -Y 65 -Width 220 -Height 110 -Parent $opsBand -Style $icons.AccessAnalyzer
Add-Node -Id 'backup' -Value 'AWS Backup<br>DynamoDB + S3 media' -X 1335 -Y 65 -Width 220 -Height 110 -Parent $opsBand -Style $icons.Backup
Add-Node -Id 'codebuild' -Value 'CodeBuild<br>la-build<br>test and package' -X 1595 -Y 65 -Width 220 -Height 110 -Parent $opsBand -Style $icons.Build
Add-Node -Id 'iam-governance' -Value 'IAM<br>execution roles and scoped policies' -X 1855 -Y 65 -Width 220 -Height 110 -Parent $opsBand -Style $icons.Iam
Add-Node -Id 'terraform' -Value 'Terraform IaC<br>manual approved apply' -X 2115 -Y 65 -Width 220 -Height 110 -Parent $opsBand -Style $actorStyle
Add-Text -Id 'ops-note' -Value 'Current account state: CodeBuild and artifact storage are deployed. CodePipeline / CodeDeploy are not shown as active runtime components because the current account does not expose them as active services.' -X 2390 -Y 55 -Width 640 -Height 150 -Parent $opsBand -Style 'text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;whiteSpace=wrap;fontSize=12;fontColor=#374151;'

$sync = '#2563EB'
$async = '#7C3AED'
$observe = '#64748B'
$secure = '#DC2626'

Add-Edge -Id 'edge-client-cf' -Source 'bidder-browser' -Target 'cf-client' -Value 'HTTPS' -Color $sync
Add-Edge -Id 'edge-cf-s3' -Source 'cf-client' -Target 's3-client' -Value 'static app' -Color $sync
Add-Edge -Id 'edge-admin-cf' -Source 'admin-browser' -Target 'cf-admin' -Value 'HTTPS' -Color $sync
Add-Edge -Id 'edge-admin-s3' -Source 'cf-admin' -Target 's3-admin' -Value 'admin app' -Color $sync
Add-Edge -Id 'edge-media-cf' -Source 'bidder-browser' -Target 'cf-media' -Value 'media read' -Color $sync
Add-Edge -Id 'edge-cf-media-s3' -Source 'cf-media' -Target 's3-media' -Value 'private origin' -Color $sync
Add-Edge -Id 'edge-cognito-confirm' -Source 'cognito' -Target 'post-confirm' -Value 'Post Confirmation' -Color $secure
Add-Edge -Id 'edge-client-cognito' -Source 'bidder-browser' -Target 'cognito' -Value 'sign-up / sign-in' -Color $sync
Add-Edge -Id 'edge-admin-cognito' -Source 'admin-browser' -Target 'cognito' -Value 'admin auth' -Color $sync
Add-Edge -Id 'edge-client-rest' -Source 'bidder-browser' -Target 'rest-api' -Value 'JWT + API key' -Color $sync
Add-Edge -Id 'edge-admin-rest' -Source 'admin-browser' -Target 'rest-api' -Value 'JWT + ADMIN' -Color $sync
Add-Edge -Id 'edge-client-ws' -Source 'bidder-browser' -Target 'websocket-api' -Value 'WSS' -Color $sync
Add-Edge -Id 'edge-rest-session' -Source 'rest-api' -Target 'session-service' -Value '/sessions' -Color $sync
Add-Edge -Id 'edge-rest-item' -Source 'rest-api' -Target 'item-service' -Value '/items' -Color $sync
Add-Edge -Id 'edge-rest-query' -Source 'rest-api' -Target 'query-service' -Value '/catalog + /categories' -Color $sync
Add-Edge -Id 'edge-rest-admin' -Source 'rest-api' -Target 'admin-command' -Value '/admin' -Color $sync
Add-Edge -Id 'edge-ws-authorizer' -Source 'websocket-api' -Target 'ws-authorizer' -Value '$connect JWT' -Color $sync
Add-Edge -Id 'edge-ws-handler' -Source 'websocket-api' -Target 'ws-handler' -Value 'routes' -Color $sync
Add-Edge -Id 'edge-ws-queue' -Source 'ws-handler' -Target 'bid-queue' -Value 'placeBid' -Color $async -Dashed $true
Add-Edge -Id 'edge-queue-processor' -Source 'bid-queue' -Target 'bid-processor' -Value 'MessageGroupId=item_id' -Color $async -Dashed $true
Add-Edge -Id 'edge-queue-dlq' -Source 'bid-queue' -Target 'bid-dlq' -Value 'failed commands' -Color $async -Dashed $true
Add-Edge -Id 'edge-processor-broadcast' -Source 'bid-processor' -Target 'broadcast' -Value 'accepted bid event' -Color $async -Dashed $true
Add-Edge -Id 'edge-broadcast-ws' -Source 'broadcast' -Target 'websocket-api' -Value 'management API' -Color $async -Dashed $true
Add-Edge -Id 'edge-scheduler-admin' -Source 'scheduler' -Target 'admin-command' -Value 'watchdog / close item' -Color $async -Dashed $true
Add-Edge -Id 'edge-scheduler-dlq' -Source 'scheduler' -Target 'scheduler-dlq' -Value 'retry exhaustion' -Color $async -Dashed $true
Add-Edge -Id 'edge-session-catalog' -Source 'session-service' -Target 'tbl-catalog' -Value 'sessions' -Color $sync
Add-Edge -Id 'edge-item-catalog' -Source 'item-service' -Target 'tbl-catalog' -Value 'items' -Color $sync
Add-Edge -Id 'edge-item-media' -Source 'item-service' -Target 'bucket-media' -Value 'presign / metadata' -Color $sync
Add-Edge -Id 'edge-query-catalog' -Source 'query-service' -Target 'tbl-catalog' -Value 'read' -Color $sync
Add-Edge -Id 'edge-query-category' -Source 'query-service' -Target 'tbl-category' -Value 'read' -Color $sync
Add-Edge -Id 'edge-query-state' -Source 'query-service' -Target 'tbl-state' -Value 'read' -Color $sync
Add-Edge -Id 'edge-query-bids' -Source 'query-service' -Target 'tbl-bids' -Value 'history' -Color $sync
Add-Edge -Id 'edge-admin-category' -Source 'admin-command' -Target 'tbl-category' -Value 'CRUD' -Color $secure
Add-Edge -Id 'edge-admin-audit' -Source 'admin-command' -Target 'tbl-admin-audit' -Value 'audit' -Color $secure
Add-Edge -Id 'edge-processor-state' -Source 'bid-processor' -Target 'tbl-state' -Value 'conditional update' -Color $sync
Add-Edge -Id 'edge-processor-bids' -Source 'bid-processor' -Target 'tbl-bids' -Value 'append event' -Color $sync
Add-Edge -Id 'edge-processor-idempotency' -Source 'bid-processor' -Target 'tbl-idempotency' -Value 'dedupe' -Color $sync
Add-Edge -Id 'edge-ws-connections' -Source 'ws-handler' -Target 'tbl-connections' -Value 'room state' -Color $sync
Add-Edge -Id 'edge-broadcast-connections' -Source 'broadcast' -Target 'tbl-connections' -Value 'read connections' -Color $sync
Add-Edge -Id 'edge-cloudwatch' -Source 'cloudwatch' -Target 'sns' -Value 'alarms' -Color $observe -Dashed $true
Add-Edge -Id 'edge-cloudtrail-audit' -Source 'cloudtrail' -Target 'bucket-audit' -Value 'versioned logs' -Color $observe -Dashed $true
Add-Edge -Id 'edge-config-audit' -Source 'config' -Target 'bucket-audit' -Value 'snapshots' -Color $observe -Dashed $true
Add-Edge -Id 'edge-backup-data' -Source 'backup' -Target 'tbl-state' -Value 'recovery' -Color $observe -Dashed $true
Add-Edge -Id 'edge-backup-media' -Source 'backup' -Target 'bucket-media' -Value 'recovery' -Color $observe -Dashed $true
Add-Edge -Id 'edge-build-artifact' -Source 'codebuild' -Target 'bucket-artifacts' -Value 'versioned artifact' -Color $observe -Dashed $true
Add-Edge -Id 'edge-terraform-state' -Source 'terraform' -Target 'bucket-tfstate' -Value 'remote state' -Color $observe -Dashed $true
Add-Edge -Id 'edge-iam-runtime' -Source 'iam-governance' -Target 'admin-command' -Value 'least privilege' -Color $secure -Dashed $true

$document.DocumentElement.ReplaceChild($page, $originalPage) | Out-Null
$document.Save($resolvedPath)
Write-Output "Rebuilt $originalName with embedded page-6 icons: $($icons.Count) icon styles, 5 AWS layers, 50 diagram cells."
