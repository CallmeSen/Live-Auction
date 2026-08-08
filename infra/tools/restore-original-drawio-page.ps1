param(
    [string]$Path = (Join-Path $PSScriptRoot '..\..\high_availability_live_auction_aws_2026_v2.drawio'),
    [string]$BackupPath = (Join-Path $PSScriptRoot '..\..\.$high_availability_live_auction_aws_2026_v2.drawio.bkp')
)

$ErrorActionPreference = 'Stop'

$resolvedPath = (Resolve-Path -LiteralPath $Path).Path
$resolvedBackupPath = (Resolve-Path -LiteralPath $BackupPath).Path
$pageName = 'Original - Before Review'

$document = [System.Xml.XmlDocument]::new()
$document.PreserveWhitespace = $true
$document.Load($resolvedPath)

$backup = [System.Xml.XmlDocument]::new()
$backup.PreserveWhitespace = $true
$backup.Load($resolvedBackupPath)

$currentPage = $document.SelectSingleNode("/mxfile/diagram[@name='$pageName']")
$backupPage = $backup.SelectSingleNode("/mxfile/diagram[@name='$pageName']")
if ($null -eq $currentPage) {
    throw "Current diagram page was not found: $pageName"
}
if ($null -eq $backupPage) {
    throw "Backup diagram page was not found: $pageName"
}

$nextPage = $currentPage.NextSibling
$document.DocumentElement.RemoveChild($currentPage) | Out-Null
$importedPage = $document.ImportNode($backupPage, $true)
if ($null -ne $nextPage) {
    $document.DocumentElement.InsertBefore($importedPage, $nextPage) | Out-Null
} else {
    $document.DocumentElement.AppendChild($importedPage) | Out-Null
}

$document.Save($resolvedPath)
Write-Output "Restored $pageName from $resolvedBackupPath."
