import os
import shutil
import stat
import subprocess
import zipfile
from hashlib import sha256
from pathlib import Path, PurePosixPath

import pytest


pytestmark = pytest.mark.artifact_build

REPO_ROOT = Path(__file__).parents[3]
BUILD_SCRIPT = REPO_ROOT / "backend" / "build.ps1"
BUILD_ROOT = REPO_ROOT / "backend" / "build"
REQUIREMENTS_LOCK = REPO_ROOT / "backend" / "common" / "requirements.lock.txt"
PINNED_SAM_IMAGE = (
    "public.ecr.aws/sam/build-python3.13"
    "@sha256:34304fcf5a4eb290770734a1490a6a32e16d58858a18de3ef40807055ed06d44"
)
FUNCTION_NAMES = ("bid_processor", "ws_authorizer", "ws_handler", "broadcast")
STAGE3_FUNCTION_NAMES = (
    "session_service",
    "item_service",
    "query_service",
    "admin_command",
)
ALL_FUNCTION_NAMES = FUNCTION_NAMES + STAGE3_FUNCTION_NAMES
_CREDENTIAL_FILE_NAMES = {
    ".env",
    "credentials",
    "credentials.json",
    "id_ed25519",
    "id_rsa",
    "key.pem",
    "private.pem",
    "secrets.json",
}


def _run_build(target: str, function_name: str = "bid_processor") -> None:
    completed = subprocess.run(
        [
            "powershell",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(BUILD_SCRIPT),
            "-Target",
            target,
            "-FunctionName",
            function_name,
        ],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=600,
    )

    assert completed.returncode == 0, (completed.stdout or "") + (
        completed.stderr or ""
    )


def _archive_hash(path: Path) -> str:
    return sha256(path.read_bytes()).hexdigest()


def _function_name_allowlist() -> set[str]:
    script = """
$command = Get-Command $env:BUILD_SCRIPT_UNDER_TEST
$attribute = $command.Parameters['FunctionName'].Attributes |
    Where-Object { $_ -is [System.Management.Automation.ValidateSetAttribute] }
$attribute.ValidValues
"""
    env = os.environ.copy()
    env["BUILD_SCRIPT_UNDER_TEST"] = str(BUILD_SCRIPT)
    completed = subprocess.run(
        [
            "powershell",
            "-NoProfile",
            "-Command",
            script,
        ],
        cwd=REPO_ROOT,
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )

    assert completed.returncode == 0, (completed.stdout or "") + (
        completed.stderr or ""
    )
    return set(completed.stdout.splitlines())


def _build_script_parameter_defaults() -> dict[str, str]:
    script = """
$tokens = $null
$errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile(
    $env:BUILD_SCRIPT_UNDER_TEST,
    [ref]$tokens,
    [ref]$errors
)
if ($errors.Count -ne 0) {
    $errors | ForEach-Object { Write-Error $_.Message }
    exit 1
}
$ast.ParamBlock.Parameters | ForEach-Object {
    "$($_.Name.VariablePath.UserPath)=$($_.DefaultValue.SafeGetValue())"
}
"""
    env = os.environ.copy()
    env["BUILD_SCRIPT_UNDER_TEST"] = str(BUILD_SCRIPT)
    completed = subprocess.run(
        ["powershell", "-NoProfile", "-Command", script],
        cwd=REPO_ROOT,
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )

    assert completed.returncode == 0, (completed.stdout or "") + (
        completed.stderr or ""
    )
    return dict(line.split("=", 1) for line in completed.stdout.splitlines())


def _assert_archive_is_clean(names: set[str]) -> None:
    for name in names:
        parts = tuple(part.lower() for part in PurePosixPath(name).parts)
        leaf = parts[-1] if parts else ""

        assert not name.lower().endswith(".pyc"), name
        assert not name.lower().endswith(".pyd"), name
        assert "__pycache__" not in parts, name
        assert "tests" not in parts, name
        assert not any(part.startswith(".venv") for part in parts), name
        assert leaf not in _CREDENTIAL_FILE_NAMES, name
        assert not leaf.startswith(".env."), name
        assert "access_key" not in leaf, name
        assert "secret_key" not in leaf, name
        assert not leaf.endswith(".key"), name
        assert not (
            leaf.endswith(".pem")
            and (
                "private" in leaf
                or leaf.endswith(("-key.pem", "_key.pem", ".key.pem"))
            )
        ), name


def _assert_archive_members_are_safe(archive: zipfile.ZipFile) -> None:
    for info in archive.infolist():
        member = PurePosixPath(info.filename)
        mode = info.external_attr >> 16
        assert not member.is_absolute(), info.filename
        assert ".." not in member.parts, info.filename
        assert not stat.S_ISLNK(mode), info.filename


@pytest.mark.parametrize(
    "name",
    [
        "python/native/module.pyd",
        "python/certs/deployment.key",
        "python/certs/key.pem",
        "python/certs/private.pem",
        "python/certs/service-key.pem",
    ],
)
def test_archive_cleanliness_rejects_private_key_and_windows_binary_names(
    name: str,
):
    with pytest.raises(AssertionError, match=name):
        _assert_archive_is_clean({name})


@pytest.mark.parametrize(
    "name",
    ["python/botocore/cacert.pem", "python/cryptography/hazmat/bindings/_rust.abi3.so"],
)
def test_archive_cleanliness_allows_ca_certificates_and_linux_binaries(name: str):
    _assert_archive_is_clean({name})


def test_build_script_allows_only_declared_function_packages():
    assert _function_name_allowlist() == set(ALL_FUNCTION_NAMES)


def test_build_script_pins_immutable_sam_image():
    source = BUILD_SCRIPT.read_text(encoding="utf-8")

    assert PINNED_SAM_IMAGE in source
    assert "public.ecr.aws/sam/build-python3.13:latest" not in source


def test_layer_build_requires_transitive_hash_lock():
    source = BUILD_SCRIPT.read_text(encoding="utf-8")

    assert REQUIREMENTS_LOCK.is_file()
    lock_source = REQUIREMENTS_LOCK.read_text(encoding="utf-8")
    assert "--hash=sha256:" in lock_source
    assert "--require-hashes" in source
    assert "common/requirements.lock.txt" in source.replace("\\", "/")


def test_function_archives_use_pinned_container_and_atomic_destination():
    source = BUILD_SCRIPT.read_text(encoding="utf-8")
    function_body = source.split("function Build-Function", 1)[1].split(
        'if ($Target -in @("layer", "all"))', 1
    )[0]

    assert "Get-PythonExecutable" not in source
    assert "New-ZipFromDirectory" not in source
    assert "Remove-Item -LiteralPath $LayerZip" not in source
    assert "Remove-Item -LiteralPath $FunctionZip" not in source
    assert "& docker @dockerArgs" in function_body
    assert "$SamBuildImage" in function_body
    assert "$ZipTool" in function_body


def test_build_script_defaults_and_all_branches_are_preserved():
    source = BUILD_SCRIPT.read_text(encoding="utf-8")

    assert _build_script_parameter_defaults() == {
        "Target": "all",
        "FunctionName": "bid_processor",
    }
    assert 'if ($Target -in @("layer", "all"))' in source
    assert 'if ($Target -in @("function", "all"))' in source
    assert "Build-Layer" in source
    assert "Build-Function" in source


def test_function_build_preserves_existing_artifact_when_zip_tool_fails(
    tmp_path: Path,
):
    backend_root = tmp_path / "backend"
    function_source = backend_root / "functions" / "session_service"
    tools_root = backend_root / "tools"
    build_root = backend_root / "build"
    function_source.mkdir(parents=True)
    tools_root.mkdir()
    build_root.mkdir()
    shutil.copy2(BUILD_SCRIPT, backend_root / "build.ps1")
    (function_source / "__init__.py").write_text("", encoding="utf-8")
    (function_source / "handler.py").write_text("value = 1\n", encoding="utf-8")
    (tools_root / "deterministic_zip.py").write_text(
        'raise RuntimeError("forced zip failure")\n',
        encoding="utf-8",
    )
    function_zip = build_root / "session_service.zip"
    original = b"existing artifact"
    function_zip.write_bytes(original)

    completed = subprocess.run(
        [
            "powershell",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(backend_root / "build.ps1"),
            "-Target",
            "function",
            "-FunctionName",
            "session_service",
        ],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=120,
    )

    assert completed.returncode != 0
    assert "forced zip failure" in (completed.stdout + completed.stderr)
    assert function_zip.read_bytes() == original


def test_target_all_builds_layer_and_selected_function(stage3_build_artifacts):
    assert stage3_build_artifacts["layer"]
    assert stage3_build_artifacts["session_service"]


def test_build_script_creates_deterministic_lambda_layer_archive(
    stage3_build_artifacts,
):
    layer_zip = BUILD_ROOT / "layer.zip"
    first_hash = stage3_build_artifacts["layer"]

    assert layer_zip.is_file()
    with zipfile.ZipFile(layer_zip) as archive:
        names = set(archive.namelist())
        assert "python/auction_common/auth.py" in names
        assert "python/auction_common/models.py" in names
        assert any(name.startswith("python/aws_lambda_powertools/") for name in names)
        assert any(name.startswith("python/cryptography/") for name in names)
        assert any(name.startswith("python/jwt/") for name in names)
        assert any(name.startswith("python/pydantic/") for name in names)
        _assert_archive_is_clean(names)
        _assert_archive_members_are_safe(archive)

    _run_build("layer")

    assert _archive_hash(layer_zip) == first_hash


@pytest.mark.parametrize("function_name", FUNCTION_NAMES)
def test_build_script_creates_deterministic_function_archive(function_name: str):
    function_zip = BUILD_ROOT / f"{function_name}.zip"

    _run_build("function", function_name)

    assert function_zip.is_file()
    with zipfile.ZipFile(function_zip) as archive:
        names = set(archive.namelist())
        assert "handler.py" in names
        assert "__init__.py" in names
        _assert_archive_is_clean(names)
        _assert_archive_members_are_safe(archive)

    first_hash = _archive_hash(function_zip)
    _run_build("function", function_name)

    assert _archive_hash(function_zip) == first_hash


@pytest.mark.parametrize("function_name", STAGE3_FUNCTION_NAMES)
def test_stage3_function_archive_is_deterministic(
    function_name: str,
    stage3_build_artifacts,
):
    function_zip = BUILD_ROOT / f"{function_name}.zip"
    first_hash = stage3_build_artifacts[function_name]

    _run_build("function", function_name)

    assert _archive_hash(function_zip) == first_hash


@pytest.mark.parametrize("function_name", STAGE3_FUNCTION_NAMES)
def test_stage3_archive_contains_only_runtime_python(
    function_name: str,
    stage3_build_artifacts,
):
    function_source = REPO_ROOT / "backend" / "functions" / function_name
    function_zip = BUILD_ROOT / f"{function_name}.zip"
    expected_names = sorted(path.name for path in function_source.glob("*.py"))

    assert function_zip.is_file()
    with zipfile.ZipFile(function_zip) as archive:
        names = archive.namelist()
        assert names == expected_names
        assert "handler.py" in names
        _assert_archive_is_clean(set(names))
        _assert_archive_members_are_safe(archive)

        for source_path in function_source.glob("*.py"):
            expected_source = (
                source_path.read_bytes()
                .replace(b"\r\n", b"\n")
                .replace(b"\r", b"\n")
            )
            assert archive.read(source_path.name) == expected_source

        source = archive.read("handler.py").decode("utf-8").lower()
        for forbidden_dependency in ("sqlalchemy", "pymysql", "jwt.encode", "fastapi"):
            assert forbidden_dependency not in source
