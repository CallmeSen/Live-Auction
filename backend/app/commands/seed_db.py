"""Load test seed data on first startup."""

import sys
import time
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError

import app.models  # noqa: F401
from app.core.config import settings
from app.database.base import Base

SEED_MARKER_EMAIL = "nguyenminhquan@gmail.com"
SQL_FILE = Path(__file__).resolve().parents[2] / "test.sql"
MAX_RETRIES = 30
RETRY_DELAY_SECONDS = 2


def _sync_database_url() -> str:
    return settings.database_url.replace(
        "mysql+asyncmy",
        "mysql+pymysql",
    )


def _wait_for_database(engine) -> None:
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            with engine.connect() as connection:
                connection.execute(text("SELECT 1"))
            return
        except OperationalError:
            if attempt == MAX_RETRIES:
                raise
            print(
                f"Waiting for database... ({attempt}/{MAX_RETRIES})",
                flush=True,
            )
            time.sleep(RETRY_DELAY_SECONDS)


def _is_seeded(connection) -> bool:
    result = connection.execute(
        text("SELECT COUNT(*) FROM users WHERE email = :email"),
        {"email": SEED_MARKER_EMAIL},
    )
    return bool(result.scalar())


def _run_sql_file(connection, sql_path: Path) -> None:
    raw_sql = sql_path.read_text(encoding="utf-8")
    statement_lines: list[str] = []

    for line in raw_sql.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("--"):
            continue

        statement_lines.append(line)
        if stripped.endswith(";"):
            connection.execute(text("\n".join(statement_lines)))
            statement_lines = []


def main() -> None:
    if not SQL_FILE.is_file():
        print(f"Seed file not found: {SQL_FILE}", file=sys.stderr)
        sys.exit(1)

    engine = create_engine(_sync_database_url())
    _wait_for_database(engine)

    with engine.begin() as connection:
        Base.metadata.create_all(bind=connection)

    with engine.begin() as connection:
        if _is_seeded(connection):
            print("Seed data already exists, skipping.")
            return

        print(f"Seeding database from {SQL_FILE.name}...")
        _run_sql_file(connection, SQL_FILE)
        print("Seed data inserted successfully.")


if __name__ == "__main__":
    try:
        main()
    except Exception as exception:
        print(f"Seed failed: {exception}", file=sys.stderr)
        sys.exit(1)
