param(
    [string]$Path = (Join-Path $PSScriptRoot '..\..\high_availability_live_auction_aws_2026_v2.drawio')
)

$ErrorActionPreference = 'Stop'

$resolvedPath = (Resolve-Path -LiteralPath $Path).Path
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$assetRoot = Join-Path $repositoryRoot 'assets\aws-icons'
$document = [System.Xml.XmlDocument]::new()
$document.PreserveWhitespace = $true
$document.Load($resolvedPath)

$pageName = '06 - AWS PNG Icon Catalog'
$existingPage = $document.SelectSingleNode("/mxfile/diagram[@name='$pageName']")
if ($null -ne $existingPage) {
    $document.DocumentElement.RemoveChild($existingPage) | Out-Null
}

$files = @(
    Get-ChildItem -LiteralPath $assetRoot -Recurse -File -Filter '*.png' -ErrorAction Stop |
        Where-Object { $_.FullName -notmatch '\\(?:__MACOSX)(?:\\|$)' } |
        Sort-Object FullName
)
if ($files.Count -eq 0) {
    throw "No PNG assets found under $assetRoot"
}

$columns = 24
$cellWidth = 110
$cellHeight = 112
$headerHeight = 32
$topOffset = 110
$pageWidth = $columns * $cellWidth + 80
$row = 0
$column = 0

$page = $document.CreateElement('diagram')
$page.SetAttribute('id', 'aws-png-icon-catalog')
$page.SetAttribute('name', $pageName)

$model = $document.CreateElement('mxGraphModel')
foreach ($attribute in @{
    dx = '2400'
    dy = '1800'
    grid = '1'
    gridSize = '10'
    guides = '1'
    tooltips = '1'
    connect = '1'
    arrows = '1'
    fold = '1'
    page = '1'
    pageScale = '1'
    pageWidth = [string]$pageWidth
    pageHeight = '10000'
    math = '0'
    shadow = '0'
}.GetEnumerator()) {
    $model.SetAttribute($attribute.Key, $attribute.Value)
}

$root = $document.CreateElement('root')
$model.AppendChild($root) | Out-Null
$page.AppendChild($model) | Out-Null
$document.DocumentElement.AppendChild($page) | Out-Null

$rootCell = $document.CreateElement('mxCell')
$rootCell.SetAttribute('id', '0')
$root.AppendChild($rootCell) | Out-Null

$layerCell = $document.CreateElement('mxCell')
$layerCell.SetAttribute('id', '1')
$layerCell.SetAttribute('parent', '0')
$root.AppendChild($layerCell) | Out-Null

function Add-TextVertex {
    param(
        [string]$Id,
        [string]$Value,
        [double]$X,
        [double]$Y,
        [double]$Width,
        [double]$Height,
        [string]$Style
    )

    $cell = $document.CreateElement('mxCell')
    $cell.SetAttribute('id', $Id)
    $cell.SetAttribute('parent', '1')
    $cell.SetAttribute('style', $Style)
    $cell.SetAttribute('value', $Value)
    $cell.SetAttribute('vertex', '1')
    $geometry = $document.CreateElement('mxGeometry')
    $geometry.SetAttribute('x', [string]$X)
    $geometry.SetAttribute('y', [string]$Y)
    $geometry.SetAttribute('width', [string]$Width)
    $geometry.SetAttribute('height', [string]$Height)
    $geometry.SetAttribute('as', 'geometry')
    $cell.AppendChild($geometry) | Out-Null
    $root.AppendChild($cell) | Out-Null
}

function Get-PngDataUri {
    param([string]$FilePath)

    $bytes = [System.IO.File]::ReadAllBytes($FilePath)
    # The semicolon separates draw.io style properties, so it must be URI-encoded.
    return 'data:image/png%3Bbase64,' + [Convert]::ToBase64String($bytes)
}

Add-TextVertex `
    -Id 'aws-png-catalog-title' `
    -Value 'AWS PNG Icon Catalog' `
    -X 40 -Y 24 -Width ($pageWidth - 80) -Height 42 `
    -Style 'text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;whiteSpace=wrap;fontSize=22;fontStyle=1;fontColor=#16191F;'

Add-TextVertex `
    -Id 'aws-png-catalog-subtitle' `
    -Value "All $($files.Count) PNG assets under assets/aws-icons | embedded in this draw.io file | grouped by AWS icon family and size" `
    -X 40 -Y 70 -Width ($pageWidth - 80) -Height 28 `
    -Style 'text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;whiteSpace=wrap;fontSize=12;fontColor=#545B64;'

$groups = $files | Group-Object {
    $relative = $_.FullName.Substring($repositoryRoot.Length + 1)
    $parts = $relative.Split([IO.Path]::DirectorySeparatorChar)
    if ($parts.Count -ge 3) {
        "$($parts[0])/$($parts[1])"
    } else {
        $parts[0]
    }
}

$imageIndex = 0
$groupIndex = 0
foreach ($group in $groups) {
    if ($column -ne 0) {
        $row++
        $column = 0
    }

    $headerY = $topOffset + ($row * $cellHeight)
    Add-TextVertex `
        -Id ("aws-png-group-{0:D3}" -f $groupIndex) `
        -Value ([System.Net.WebUtility]::HtmlEncode("$($group.Name) ($($group.Count) PNGs)")) `
        -X 40 -Y $headerY -Width ($pageWidth - 80) -Height $headerHeight `
        -Style 'text;html=1;strokeColor=#7A8793;fillColor=#E8EDF3;align=left;verticalAlign=middle;spacingLeft=10;whiteSpace=wrap;fontSize=13;fontStyle=1;fontColor=#232F3E;'
    $groupIndex++
    $row++

    foreach ($file in $group.Group) {
        $imageIndex++
        $relative = $file.FullName.Substring($repositoryRoot.Length + 1).Replace('\', '/')
        $label = [System.Net.WebUtility]::HtmlEncode($file.BaseName)
        $x = 40 + ($column * $cellWidth)
        $y = $topOffset + ($row * $cellHeight)
        $imageUri = Get-PngDataUri $file.FullName
        $cell = $document.CreateElement('mxCell')
        $cell.SetAttribute('id', ("aws-png-icon-{0:D4}" -f $imageIndex))
        $cell.SetAttribute('parent', '1')
        $cell.SetAttribute('style', 'shape=image;image=' + $imageUri + ';aspect=fixed;html=1;align=center;verticalAlign=top;verticalLabelPosition=bottom;whiteSpace=wrap;fontSize=8;fontColor=#232F3E;spacingTop=4;spacingBottom=2;')
        $cell.SetAttribute('value', $label)
        $cell.SetAttribute('tooltip', $relative)
        $cell.SetAttribute('vertex', '1')
        $geometry = $document.CreateElement('mxGeometry')
        $geometry.SetAttribute('x', [string]$x)
        $geometry.SetAttribute('y', [string]$y)
        $geometry.SetAttribute('width', [string]($cellWidth - 8))
        $geometry.SetAttribute('height', [string]($cellHeight - 8))
        $geometry.SetAttribute('as', 'geometry')
        $cell.AppendChild($geometry) | Out-Null
        $root.AppendChild($cell) | Out-Null

        $column++
        if ($column -eq $columns) {
            $row++
            $column = 0
        }
    }
}

$pageHeight = [math]::Max(2300, $topOffset + (($row + 1) * $cellHeight) + 80)
$model.SetAttribute('pageHeight', [string]$pageHeight)
$document.Save($resolvedPath)
Write-Output "Created $pageName with $imageIndex PNG image cells."
