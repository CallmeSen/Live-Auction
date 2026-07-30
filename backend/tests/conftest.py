import subprocess
import sys
from hashlib import sha256
from pathlib import Path

import pytest


BACKEND_ROOT = Path(__file__).parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


REPO_ROOT = BACKEND_ROOT.parent
BUILD_SCRIPT = BACKEND_ROOT / "build.ps1"
BUILD_ROOT = BACKEND_ROOT / "build"
STAGE3_FUNCTION_NAMES = (
    "session_service",
    "item_service",
    "query_service",
    "admin_command",
)


def _run_build(target: str, function_name: str) -> None:
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


@pytest.fixture(scope="session")
def stage3_build_artifacts() -> dict[str, str]:
    _run_build("all", STAGE3_FUNCTION_NAMES[0])
    for function_name in STAGE3_FUNCTION_NAMES[1:]:
        _run_build("function", function_name)

    paths = {"layer": BUILD_ROOT / "layer.zip"}
    paths.update(
        {
            function_name: BUILD_ROOT / f"{function_name}.zip"
            for function_name in STAGE3_FUNCTION_NAMES
        }
    )
    for path in paths.values():
        assert path.is_file(), path
    return {
        name: sha256(path.read_bytes()).hexdigest()
        for name, path in paths.items()
    }
