import ast
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest


ROOT = Path(__file__).parents[2]
BUILD_ROOT = ROOT / "build"
STAGE3_FUNCTION_NAMES = (
    "session_service",
    "item_service",
    "query_service",
    "admin_command",
)
PINNED_SAM_IMAGE = (
    "public.ecr.aws/sam/build-python3.13"
    "@sha256:34304fcf5a4eb290770734a1490a6a32e16d58858a18de3ef40807055ed06d44"
)


def _run_artifact_container(script: str, environment: tuple[str, ...] = ()):
    mount_source = str(BUILD_ROOT.resolve()).replace("\\", "/")
    command = [
        "docker",
        "run",
        "--rm",
        "--mount",
        f"type=bind,source={mount_source},target=/artifacts,readonly",
        "--env",
        "AWS_EC2_METADATA_DISABLED=true",
    ]
    for value in environment:
        command.extend(("--env", value))
    command.extend(
        ("--entrypoint", "python", PINNED_SAM_IMAGE, "-S", "-c", script)
    )
    return subprocess.run(
        command,
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
        timeout=120,
    )


def test_query_service_imports_from_isolated_function_package(tmp_path):
    function_root = tmp_path / "function"
    layer_root = tmp_path / "layer" / "python"
    function_root.mkdir(parents=True)
    shutil.copy2(
        ROOT / "functions" / "query_service" / "handler.py",
        function_root / "handler.py",
    )
    shutil.copytree(ROOT / "common" / "auction_common", layer_root / "auction_common")

    env = os.environ.copy()
    env["PYTHONPATH"] = os.pathsep.join((str(function_root), str(layer_root)))
    env["PYTHONNOUSERSITE"] = "1"
    result = subprocess.run(
        [sys.executable, "-c", "import handler; print(handler.app.__class__.__name__)"],
        cwd=tmp_path,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "APIGatewayRestResolver"


def test_control_plane_handlers_do_not_import_other_function_packages():
    violations = []
    for service_name in (
        "session_service",
        "item_service",
        "query_service",
        "admin_command",
    ):
        handler = ROOT / "functions" / service_name / "handler.py"
        if not handler.is_file():
            continue
        tree = ast.parse(handler.read_text(encoding="utf-8"), filename=str(handler))
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom):
                module = node.module or ""
                if module.startswith("functions."):
                    violations.append(f"{service_name}: from {module} import ...")
            elif isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.name.startswith("functions."):
                        violations.append(f"{service_name}: import {alias.name}")

    assert violations == []


def test_transaction_handlers_never_use_the_resource_meta_client_directly():
    for service_name in ("session_service", "item_service", "admin_command"):
        source = (ROOT / "functions" / service_name / "handler.py").read_text(
            encoding="utf-8"
        )
        assert ".meta.client.transact_write_items" not in source
        assert "transaction_client(" in source
        assert "boto3.session.Session()" in source
        assert "table._transaction_client = client" in source


@pytest.mark.parametrize(
    "function_name",
    ["session_service", "item_service", "query_service", "admin_command"],
)
def test_stage3_function_package_exists(function_name: str) -> None:
    package = ROOT / "functions" / function_name
    assert (package / "__init__.py").is_file()
    assert (package / "handler.py").is_file()


@pytest.mark.parametrize("function_name", STAGE3_FUNCTION_NAMES)
@pytest.mark.artifact_build
def test_stage3_archive_imports_with_common_layer_layout(
    function_name: str,
    stage3_build_artifacts,
) -> None:
    function_archive = BUILD_ROOT / f"{function_name}.zip"
    layer_archive = BUILD_ROOT / "layer.zip"

    assert function_archive.is_file()
    assert layer_archive.is_file()
    container_script = """
import os
import sys
import tempfile
import zipfile
from pathlib import Path

with tempfile.TemporaryDirectory() as temporary_directory:
    root = Path(temporary_directory)
    function_archive = os.environ["FUNCTION_ARCHIVE"]
    with zipfile.ZipFile(f"/artifacts/{function_archive}") as archive:
        archive.extractall(root / "function")
    with zipfile.ZipFile("/artifacts/layer.zip") as archive:
        archive.extractall(root / "layer")
    sys.path[:0] = [str(root / "function"), str(root / "layer" / "python")]
    import handler
    print(type(handler.app).__name__)
"""
    result = _run_artifact_container(
        container_script,
        (f"FUNCTION_ARCHIVE={function_archive.name}",),
    )

    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "APIGatewayRestResolver"


@pytest.mark.artifact_build
def test_layer_native_dependencies_import_in_pinned_image(
    stage3_build_artifacts,
) -> None:
    layer_archive = BUILD_ROOT / "layer.zip"

    assert layer_archive.is_file()
    container_script = """
import sys
import tempfile
import zipfile
from pathlib import Path

with tempfile.TemporaryDirectory() as temporary_directory:
    root = Path(temporary_directory)
    with zipfile.ZipFile("/artifacts/layer.zip") as archive:
        archive.extractall(root / "layer")
    sys.path.insert(0, str(root / "layer" / "python"))
    import botocore
    import cryptography.hazmat.bindings._rust
    import pydantic_core._pydantic_core
    import psycopg
    from psycopg import pq
    print(botocore.__version__, psycopg.__version__, pq.__impl__)
"""
    result = _run_artifact_container(container_script)

    assert result.returncode == 0, result.stderr
    assert result.stdout.strip().endswith("binary")


def test_auction_common_imports_from_lambda_layer_layout(tmp_path):
    layer_root = tmp_path / "layer"
    package_root = layer_root / "python" / "auction_common"
    source_root = Path(__file__).parents[2] / "common" / "auction_common"
    shutil.copytree(source_root, package_root)

    env = os.environ.copy()
    env["PYTHONPATH"] = str(layer_root / "python")
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            "from auction_common.models import BidCommand; print(BidCommand.__name__)",
        ],
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "BidCommand"
