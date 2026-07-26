from __future__ import annotations

import argparse
import os
import stat
import tempfile
from pathlib import Path, PurePosixPath
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo


FIXED_TIMESTAMP = (1980, 1, 1, 0, 0, 0)


def _is_link(path: Path) -> bool:
    is_junction = getattr(path, "is_junction", None)
    return path.is_symlink() or bool(is_junction and is_junction())


def _is_within(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
    except ValueError:
        return False
    return True


def _validate_member_name(name: str) -> None:
    member = PurePosixPath(name)
    if not name or member.is_absolute() or ".." in member.parts:
        raise ValueError(f"Unsafe archive member name: {name}")


def _source_files(source: Path) -> tuple[Path, list[tuple[str, Path]]]:
    if _is_link(source):
        raise ValueError(f"Source root must not be a symlink: {source}")
    if not source.is_dir():
        raise ValueError(f"Source directory does not exist: {source}")

    source_root = source.resolve(strict=True)
    files: list[tuple[str, Path]] = []
    for directory, directory_names, file_names in os.walk(
        source,
        topdown=True,
        followlinks=False,
    ):
        directory_path = Path(directory)
        for name in sorted((*directory_names, *file_names)):
            path = directory_path / name
            if _is_link(path):
                raise ValueError(f"Source must not contain symlinks: {path}")
            resolved = path.resolve(strict=True)
            if not _is_within(resolved, source_root):
                raise ValueError(f"Source path resolves outside source root: {path}")

        for name in file_names:
            path = directory_path / name
            if not path.is_file():
                raise ValueError(f"Source entry is not a regular file: {path}")
            relative_path = path.relative_to(source).as_posix()
            _validate_member_name(relative_path)
            files.append((relative_path, path))

    files.sort(key=lambda item: item[0])
    return source_root, files


def _validate_destination_parents(parent: Path) -> None:
    current = parent
    while True:
        if _is_link(current):
            raise ValueError(f"Unsafe destination parent symlink: {current}")
        if current.parent == current:
            return
        current = current.parent


def _validate_destination(destination: Path) -> Path:
    if ".." in destination.parts:
        raise ValueError(f"Unsafe destination parent traversal: {destination}")

    destination = destination.absolute()
    if _is_link(destination):
        raise ValueError(f"Unsafe destination symlink: {destination}")
    if destination.exists() and not destination.is_file():
        raise ValueError(f"Destination is not a regular file: {destination}")

    _validate_destination_parents(destination.parent)
    destination.parent.mkdir(parents=True, exist_ok=True)
    _validate_destination_parents(destination.parent)

    resolved_parent = destination.parent.resolve(strict=True)
    if os.path.normcase(str(resolved_parent)) != os.path.normcase(
        str(destination.parent)
    ):
        raise ValueError(f"Unsafe destination parent escape: {destination.parent}")
    return destination


def _source_bytes(path: Path, source_root: Path) -> bytes:
    if _is_link(path):
        raise ValueError(f"Source must not contain symlinks: {path}")
    if not _is_within(path.resolve(strict=True), source_root):
        raise ValueError(f"Source path resolves outside source root: {path}")
    content = path.read_bytes()
    if path.suffix.lower() == ".py":
        return content.replace(b"\r\n", b"\n").replace(b"\r", b"\n")
    return content


def create_archive(source: Path, destination: Path) -> None:
    source_root, files = _source_files(source)
    destination = _validate_destination(destination)
    if _is_within(destination, source_root):
        raise ValueError("Destination must be outside source root")

    file_descriptor, temporary_name = tempfile.mkstemp(
        dir=destination.parent,
        prefix=f".{destination.name}.",
        suffix=".tmp",
    )
    os.close(file_descriptor)
    temporary_path = Path(temporary_name)
    try:
        with ZipFile(
            temporary_path,
            "w",
            compression=ZIP_DEFLATED,
            compresslevel=9,
        ) as archive:
            for relative_path, path in files:
                info = ZipInfo(relative_path, FIXED_TIMESTAMP)
                info.compress_type = ZIP_DEFLATED
                info.create_system = 3
                info.external_attr = (stat.S_IFREG | 0o644) << 16
                archive.writestr(info, _source_bytes(path, source_root))

        _validate_destination(destination)
        os.replace(temporary_path, destination)
    finally:
        temporary_path.unlink(missing_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    create_archive(args.source, args.destination)


if __name__ == "__main__":
    main()
