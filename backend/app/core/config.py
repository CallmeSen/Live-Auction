from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    database_url: str
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    cors_origins: str = (
        "http://localhost:5173,"
        "http://127.0.0.1:5173,"
        "http://localhost:4173,"
        "http://127.0.0.1:4173,"
        "http://localhost:5174,"
        "http://127.0.0.1:5174,"
        "http://localhost:4174,"
        "http://127.0.0.1:4174"
    )

    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = ""
    frontend_reset_password_url: str = "http://localhost:5173/reset-password"
    password_reset_token_expire_minutes: int = 15

    storage_backend: str = "local"
    upload_dir: str = "uploads"
    max_upload_size_mb: int = 5
    s3_bucket_name: str = ""
    s3_region: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [
            origin.strip()
            for origin in self.cors_origins.split(",")
            if origin.strip()
        ]

    @property
    def smtp_sender(self) -> str:
        return self.smtp_from_email or self.smtp_username

    @property
    def max_upload_size_bytes(self) -> int:
        return self.max_upload_size_mb * 1024 * 1024

    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


settings = Settings()