import uuid
from abc import ABC, abstractmethod
from pathlib import Path

from starlette.concurrency import run_in_threadpool

from app.core.config import settings


class StorageService(ABC):
    @abstractmethod
    async def save(
        self,
        file_content: bytes,
        original_filename: str,
        content_type: str,
    ) -> str:
        """Lưu file, trả về URL công khai để truy cập."""


class LocalStorageService(StorageService):
    """Lưu vào ổ đĩa container — dùng cho giai đoạn dev hiện tại."""

    def __init__(self, upload_dir: str = "uploads") -> None:
        self.upload_dir = Path(upload_dir)
        self.upload_dir.mkdir(parents=True, exist_ok=True)

    async def save(
        self,
        file_content: bytes,
        original_filename: str,
        content_type: str,
    ) -> str:
        extension = Path(original_filename).suffix
        unique_filename = f"{uuid.uuid4()}{extension}"
        file_path = self.upload_dir / unique_filename

        def _write() -> None:
            with open(file_path, "wb") as file:
                file.write(file_content)

        await run_in_threadpool(_write)

        return f"/uploads/{unique_filename}"


class S3StorageService(StorageService):
    """
    Khung sẵn cho việc lưu trữ lên Amazon S3 khi deploy AWS.
    Cần cài `boto3` (pip install boto3) và điền đầy đủ credentials/bucket
    trước khi dùng thật — hiện tại CHƯA hoạt động, chỉ dựng sẵn interface.
    """

    def __init__(self, bucket_name: str, region: str) -> None:
        self.bucket_name = bucket_name
        self.region = region
        # import boto3
        # self.client = boto3.client("s3", region_name=region)

    async def save(
        self,
        file_content: bytes,
        original_filename: str,
        content_type: str,
    ) -> str:
        raise NotImplementedError(
            "S3StorageService chưa được triển khai đầy đủ. "
            "Cần tích hợp boto3 khi deploy lên AWS."
        )


def get_storage_service() -> StorageService:
    if settings.storage_backend == "s3":
        return S3StorageService(
            bucket_name=settings.s3_bucket_name,
            region=settings.s3_region,
        )

    return LocalStorageService(upload_dir=settings.upload_dir)