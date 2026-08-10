param(
    [string]$Path = (Join-Path $PSScriptRoot '..\..\high_availability_live_auction_aws_2026_v2.drawio')
)

$ErrorActionPreference = 'Stop'

$resolvedPath = (Resolve-Path -LiteralPath $Path).Path
$document = [System.Xml.XmlDocument]::new()
$document.PreserveWhitespace = $true
$document.Load($resolvedPath)

# This layout pass intentionally targets only the duplicated page.
$copyPage = $document.SelectSingleNode('/mxfile/diagram[@name="Copy of 01 - Complete AWS System Design"]')
if ($null -eq $copyPage) {
    throw 'Copy of 01 - Complete AWS System Design page was not found.'
}

$root = $copyPage.SelectSingleNode('mxGraphModel/root')
function Get-Cell([string]$Id) {
    $cell = $root.SelectSingleNode("mxCell[@id='$Id']")
    if ($null -eq $cell) {
        throw "Copy page cell was not found: $Id"
    }
    return $cell
}

function Set-Geometry {
    param(
        [string]$Id,
        [double]$X,
        [double]$Y,
        [Nullable[double]]$Width,
        [Nullable[double]]$Height
    )

    $geometry = (Get-Cell $Id).SelectSingleNode('mxGeometry')
    $geometry.SetAttribute('x', [string]$X)
    $geometry.SetAttribute('y', [string]$Y)
    if ($null -ne $Width) {
        $geometry.SetAttribute('width', [string]$Width)
    }
    if ($null -ne $Height) {
        $geometry.SetAttribute('height', [string]$Height)
    }
}

function Set-Position([string]$Id, [double]$X, [double]$Y) {
    Set-Geometry $Id $X $Y $null $null
}

function Clear-EdgeRouting {
    foreach ($edge in $root.SelectNodes('mxCell[@edge="1"]')) {
        $geometry = $edge.SelectSingleNode('mxGeometry')
        if ($null -eq $geometry) {
            continue
        }

        while ($true) {
            $waypoints = $geometry.SelectSingleNode('Array[@as="points"]')
            if ($null -eq $waypoints) {
                break
            }
            [void]$geometry.RemoveChild($waypoints)
        }
        while ($true) {
            $endpoint = $geometry.SelectSingleNode('mxPoint[@as="sourcePoint" or @as="targetPoint"]')
            if ($null -eq $endpoint) {
                break
            }
            [void]$geometry.RemoveChild($endpoint)
        }
    }
}

# Bring the primary workload and its operational band into a compact, readable
# grid while keeping the existing client and CI/CD panels unchanged.
Set-Geometry 'cAbc-b5FqgfVzuVr1Rbt-46' 960 560 1300 1320
Set-Geometry 'cAbc-b5FqgfVzuVr1Rbt-2' 960 1910 1300 340

# Entry and API layer.
Set-Position 'cAbc-b5FqgfVzuVr1Rbt-66' 1020 760
Set-Position 'cAbc-b5FqgfVzuVr1Rbt-32' 1180 760
Set-Position 'cAbc-b5FqgfVzuVr1Rbt-35' 1020 930
Set-Position 'cAbc-b5FqgfVzuVr1Rbt-47' 1020 1280

# REST handlers and lifecycle services.
Set-Position 'cAbc-b5FqgfVzuVr1Rbt-34' 1300 930
Set-Position 'cAbc-b5FqgfVzuVr1Rbt-48' 1300 1080
Set-Position 'cAbc-b5FqgfVzuVr1Rbt-49' 1300 1230
Set-Position 'cAbc-b5FqgfVzuVr1Rbt-54' 1530 1120
Set-Position 'cAbc-b5FqgfVzuVr1Rbt-52' 1780 1080

# Realtime bidding path and state stores.
Set-Position 'cAbc-b5FqgfVzuVr1Rbt-50' 1300 1430
Set-Position 'cAbc-b5FqgfVzuVr1Rbt-57' 1530 1510
Set-Position 'cAbc-b5FqgfVzuVr1Rbt-33' 1760 1510
Set-Position 'cAbc-b5FqgfVzuVr1Rbt-45' 1990 1690
Set-Position 'cAbc-b5FqgfVzuVr1Rbt-61' 1530 850
Set-Position 'cAbc-b5FqgfVzuVr1Rbt-65' 1980 1080
Set-Position 'cAbc-b5FqgfVzuVr1Rbt-64' 2060 1510
Set-Position 'cAbc-b5FqgfVzuVr1Rbt-56' 1760 1770

# Compact operations and security controls.
Set-Position 'cAbc-b5FqgfVzuVr1Rbt-68' 1040 2000
Set-Position 'cAbc-b5FqgfVzuVr1Rbt-76' 1040 2150
Set-Position 'cAbc-b5FqgfVzuVr1Rbt-74' 1240 2000
Set-Position 'cAbc-b5FqgfVzuVr1Rbt-77' 1240 2150
Set-Position 'cAbc-b5FqgfVzuVr1Rbt-73' 1440 2000
Set-Position 'cAbc-b5FqgfVzuVr1Rbt-78' 1440 2150
Set-Position 'cAbc-b5FqgfVzuVr1Rbt-69' 1640 2000
Set-Position 'cAbc-b5FqgfVzuVr1Rbt-70' 1840 2000
Set-Position 'cAbc-b5FqgfVzuVr1Rbt-71' 2040 2000
Set-Position 'cAbc-b5FqgfVzuVr1Rbt-75' 2170 2000

# Keep the numbered markers beside the nodes after the layout pass.
Set-Position 'cAbc-b5FqgfVzuVr1Rbt-82' 980 720
Set-Position 'cAbc-b5FqgfVzuVr1Rbt-83' 1140 720
Set-Position 'cAbc-b5FqgfVzuVr1Rbt-84' 980 890
Set-Position 'cAbc-b5FqgfVzuVr1Rbt-85' 980 1240
Set-Position 'cAbc-b5FqgfVzuVr1Rbt-86' 1260 1390
Set-Position 'cAbc-b5FqgfVzuVr1Rbt-87' 1490 1470
Set-Position 'cAbc-b5FqgfVzuVr1Rbt-88' 1720 1470
Set-Position 'cAbc-b5FqgfVzuVr1Rbt-89' 1950 1650
Set-Position 'cAbc-b5FqgfVzuVr1Rbt-90' 1490 1080
Set-Position 'cAbc-b5FqgfVzuVr1Rbt-94' 1720 1730
Set-Position 'cAbc-b5FqgfVzuVr1Rbt-95' 1740 1040
Set-Position 'cAbc-b5FqgfVzuVr1Rbt-96' 2020 1470
Set-Position 'cAbc-b5FqgfVzuVr1Rbt-97' 2050 1630

# A-C remain attached to the unchanged CI/CD panel.
Set-Position 'cAbc-b5FqgfVzuVr1Rbt-91' 580 1122
Set-Position 'cAbc-b5FqgfVzuVr1Rbt-92' 740 1200
Set-Position 'cAbc-b5FqgfVzuVr1Rbt-93' 586 1550

# M1-M8 follow the compact security grid.
Set-Position 'cAbc-b5FqgfVzuVr1Rbt-98' 998 2014
Set-Position 'cAbc-b5FqgfVzuVr1Rbt-99' 998 2164
Set-Position 'cAbc-b5FqgfVzuVr1Rbt-100' 1198 2164
Set-Position 'cAbc-b5FqgfVzuVr1Rbt-101' 1198 2014
Set-Position 'cAbc-b5FqgfVzuVr1Rbt-102' 1398 2164
Set-Position 'cAbc-b5FqgfVzuVr1Rbt-103' 1598 2014
Set-Position 'cAbc-b5FqgfVzuVr1Rbt-104' 1798 2014
Set-Position 'cAbc-b5FqgfVzuVr1Rbt-105' 1998 2014

# The old page stored absolute waypoints for the former spread-out layout.
# Remove only those stale routing points; source and target cell bindings remain.
Clear-EdgeRouting

$document.Save($resolvedPath)
Write-Output 'Compacted Copy of 01 layout only.'
