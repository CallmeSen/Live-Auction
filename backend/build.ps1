[CmdletBinding()]
param(
    [ValidateSet("layer", "function", "all")]
    [string]$Target = "all",
    [ValidateSet(
        "bid_processor",
        "ws_authorizer",
        "ws_handler",
        "broadcast",
        "session_service",
        "item_service",
        "query_service",
        "admin_command"
    )]
    [string]$FunctionName = "bid_processor"
)

$ErrorActionPreference = "Stop"

$BackendRoot = $PSScriptRoot
$BuildRoot = Join-Path $BackendRoot "build"
$StagingRoot = Join-Path $BuildRoot "staging"
$FunctionStage = Join-Path $StagingRoot "function-$FunctionName"
$LayerZip = Join-Path $BuildRoot "layer.zip"
$FunctionZip = Join-Path $BuildRoot "$FunctionName.zip"
$SamBuildImage = "public.ecr.aws/sam/build-python3.13@sha256:34304fcf5a4eb290770734a1490a6a32e16d58858a18de3ef40807055ed06d44"
$ZipTool = Join-Path $BackendRoot "tools\deterministic_zip.py"
$RequirementsLock = Join-Path $BackendRoot "common\requirements.lock.txt"

function New-CleanDirectory([string]$Path) {
    if (Test-Path -LiteralPath $Path) {
        Remove-Item -LiteralPath $Path -Recurse -Force
    }
    New-Item -ItemType Directory -Path $Path -Force | Out-Null
}

function Build-Layer {
    $commonPackage = Join-Path $BackendRoot "common\auction_common"
    if (-not (Test-Path -LiteralPath $commonPackage)) {
        throw "Common package not found: $commonPackage"
    }
    if (-not (Test-Path -LiteralPath $ZipTool)) {
        throw "Deterministic zip tool not found: $ZipTool"
    }
    if (-not (Test-Path -LiteralPath $RequirementsLock)) {
        throw "Hash-locked requirements not found: $RequirementsLock"
    }

    $hostRoot = $BackendRoot -replace "\\", "/"
    $containerCommand = @(
        "set -e",
        "rm -rf /tmp/live-auction-layer",
        "mkdir -p /tmp/live-auction-layer/python",
        "python -m pip install --quiet --disable-pip-version-check --root-user-action=ignore --no-cache-dir --no-compile --require-hashes -r /var/task/common/requirements.lock.txt -t /tmp/live-auction-layer/python",
        "cp -r /var/task/common/auction_common /tmp/live-auction-layer/python/auction_common",
        "find /tmp/live-auction-layer -type d -name __pycache__ -prune -exec rm -rf '{}' +",
        "python /var/task/tools/deterministic_zip.py /tmp/live-auction-layer /var/task/build/layer.zip"
    ) -join "; "
    $dockerArgs = @(
        "run", "--rm",
        "--mount", "type=bind,source=$hostRoot,target=/var/task",
        "--entrypoint", "/bin/bash",
        $SamBuildImage,
        "-c",
        $containerCommand
    )
    & docker @dockerArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Docker dependency build failed with exit code $LASTEXITCODE"
    }

    if (-not (Test-Path -LiteralPath $LayerZip)) {
        throw "Layer archive was not created: $LayerZip"
    }
    Write-Host "Created $LayerZip"
}

function Build-Function {
    $functionSource = Join-Path $BackendRoot "functions\$FunctionName"
    if (-not (Test-Path -LiteralPath $functionSource)) {
        throw "Function directory not found: $functionSource"
    }
    if (-not (Test-Path -LiteralPath $ZipTool)) {
        throw "Deterministic zip tool not found: $ZipTool"
    }

    New-CleanDirectory $FunctionStage
    Get-ChildItem -LiteralPath $functionSource -File | Where-Object {
        $_.Extension -eq ".py"
    } | Copy-Item -Destination $FunctionStage

    $hostRoot = $BackendRoot -replace "\\", "/"
    $dockerArgs = @(
        "run", "--rm",
        "--mount", "type=bind,source=$hostRoot,target=/var/task",
        "--entrypoint", "python",
        $SamBuildImage,
        "/var/task/tools/deterministic_zip.py",
        "/var/task/build/staging/function-$FunctionName",
        "/var/task/build/$FunctionName.zip"
    )
    & docker @dockerArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Function archive build failed with exit code $LASTEXITCODE"
    }
    Write-Host "Created $FunctionZip"
}

if ($Target -in @("layer", "all")) {
    New-Item -ItemType Directory -Path $BuildRoot -Force | Out-Null
    Build-Layer
}

if ($Target -in @("function", "all")) {
    New-Item -ItemType Directory -Path $BuildRoot -Force | Out-Null
    Build-Function
}
