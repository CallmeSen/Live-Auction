import stat
import zipfile
from pathlib import Path, PurePosixPath

import pytest

from tools import deterministic_zip


REPO_ROOT = Path(__file__).parents[3]


def _make_source(root: Path, content: bytes = b"value = 1\n") -> Path:
    source = root / "source"
    source.mkdir(parents=True)
    (source / "handler.py").write_bytes(content)
    return source


def _report_as_symlink(
    monkeypatch: pytest.MonkeyPatch,
    *paths: Path,
) -> None:
    original = Path.is_symlink
    symlinks = {str(path.absolute()).casefold() for path in paths}

    def is_symlink(path: Path) -> bool:
        if str(path.absolute()).casefold() in symlinks:
            return True
        return original(path)

    monkeypatch.setattr(Path, "is_symlink", is_symlink)


def test_python_source_eol_does_not_change_archive_bytes(tmp_path: Path) -> None:
    lf_source = _make_source(tmp_path / "lf", b"first = 1\nsecond = 2\n")
    crlf_source = _make_source(tmp_path / "crlf", b"first = 1\r\nsecond = 2\r\n")
    lf_archive = tmp_path / "lf.zip"
    crlf_archive = tmp_path / "crlf.zip"

    deterministic_zip.create_archive(lf_source, lf_archive)
    deterministic_zip.create_archive(crlf_source, crlf_archive)

    assert crlf_archive.read_bytes() == lf_archive.read_bytes()
    with zipfile.ZipFile(crlf_archive) as archive:
        assert archive.read("handler.py") == b"first = 1\nsecond = 2\n"


def test_repository_declares_python_and_powershell_eol_policy() -> None:
    attributes = (REPO_ROOT / ".gitattributes").read_text(encoding="utf-8")
    policies = {
        line.strip()
        for line in attributes.splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    }

    assert "*.py text eol=lf" in policies
    assert "*.ps1 text eol=crlf" in policies


def test_source_file_symlink_is_rejected(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = _make_source(tmp_path)
    linked_file = source / "outside.py"
    linked_file.write_text("secret = True\n", encoding="utf-8")
    _report_as_symlink(monkeypatch, linked_file)

    with pytest.raises(ValueError, match="symlink"):
        deterministic_zip.create_archive(source, tmp_path / "result.zip")


def test_source_directory_symlink_is_rejected(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = _make_source(tmp_path)
    linked_directory = source / "outside"
    linked_directory.mkdir()
    (linked_directory / "extra.py").write_text("extra = True\n", encoding="utf-8")
    _report_as_symlink(monkeypatch, linked_directory)

    with pytest.raises(ValueError, match="symlink"):
        deterministic_zip.create_archive(source, tmp_path / "result.zip")


def test_symlinked_source_root_is_rejected(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source_link = _make_source(tmp_path)
    _report_as_symlink(monkeypatch, source_link)

    with pytest.raises(ValueError, match="symlink"):
        deterministic_zip.create_archive(source_link, tmp_path / "result.zip")


def test_symlink_destination_is_rejected_without_touching_artifact(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = _make_source(tmp_path / "input")
    original = b"existing artifact"
    destination = tmp_path / "destination.zip"
    destination.write_bytes(original)
    _report_as_symlink(monkeypatch, destination)

    with pytest.raises(ValueError, match="destination.*symlink"):
        deterministic_zip.create_archive(source, destination)

    assert destination.read_bytes() == original


def test_symlink_destination_parent_is_rejected(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = _make_source(tmp_path / "input")
    linked_parent = tmp_path / "linked-parent"
    linked_parent.mkdir()
    _report_as_symlink(monkeypatch, linked_parent)

    with pytest.raises(ValueError, match="destination parent"):
        deterministic_zip.create_archive(source, linked_parent / "result.zip")

    assert not (linked_parent / "result.zip").exists()


def test_symlink_destination_ancestor_is_rejected_before_creating_parent(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = _make_source(tmp_path / "input")
    linked_ancestor = tmp_path / "linked-ancestor"
    linked_ancestor.mkdir()
    missing_parent = linked_ancestor / "must-not-be-created"
    _report_as_symlink(monkeypatch, linked_ancestor)

    with pytest.raises(ValueError, match="destination parent"):
        deterministic_zip.create_archive(source, missing_parent / "result.zip")

    assert not missing_parent.exists()


def test_resolved_source_path_outside_root_is_rejected(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = _make_source(tmp_path / "input")
    source_file = source / "handler.py"
    outside = tmp_path / "outside.py"
    outside.write_text("outside = True\n", encoding="utf-8")
    original = Path.resolve

    def resolve(path: Path, *args, **kwargs):
        if path == source_file:
            return original(outside, *args, **kwargs)
        return original(path, *args, **kwargs)

    monkeypatch.setattr(Path, "resolve", resolve)

    with pytest.raises(ValueError, match="outside source root"):
        deterministic_zip.create_archive(source, tmp_path / "result.zip")


def test_destination_parent_traversal_is_rejected(tmp_path: Path) -> None:
    source = _make_source(tmp_path / "input")
    nominal_parent = tmp_path / "nominal"
    nominal_parent.mkdir()

    with pytest.raises(ValueError, match="destination parent"):
        deterministic_zip.create_archive(
            source,
            nominal_parent / ".." / "escaped.zip",
        )

    assert not (tmp_path / "escaped.zip").exists()


def test_archive_members_are_safe_regular_files(tmp_path: Path) -> None:
    source = _make_source(tmp_path / "input")
    nested = source / "package"
    nested.mkdir()
    (nested / "module.py").write_text("value = 2\n", encoding="utf-8")
    destination = tmp_path / "result.zip"

    deterministic_zip.create_archive(source, destination)

    with zipfile.ZipFile(destination) as archive:
        for info in archive.infolist():
            member = PurePosixPath(info.filename)
            mode = info.external_attr >> 16
            assert not member.is_absolute()
            assert ".." not in member.parts
            assert stat.S_ISREG(mode)
            assert not stat.S_ISLNK(mode)


def test_failure_preserves_existing_archive_and_cleans_temporary_file(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = _make_source(tmp_path / "input")
    destination = tmp_path / "result.zip"
    original = b"existing artifact"
    destination.write_bytes(original)

    def fail_write(*_args, **_kwargs):
        raise RuntimeError("forced zip failure")

    monkeypatch.setattr(deterministic_zip.ZipFile, "writestr", fail_write)

    with pytest.raises(RuntimeError, match="forced zip failure"):
        deterministic_zip.create_archive(source, destination)

    assert destination.read_bytes() == original
    assert list(tmp_path.glob(f".{destination.name}.*.tmp")) == []
