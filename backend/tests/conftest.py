import os

os.environ.setdefault(
    "DATABASE_URL",
    "mysql+asyncmy://test:test@localhost:3306/test",
)
os.environ.setdefault("JWT_SECRET_KEY", "pytest-secret-key")

import pytest