import re


def validate_admin_password(password: str) -> None:
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters")

    if len(password) > 72:
        raise ValueError("Password must not exceed 72 characters")

    if not re.search(r"[A-Z]", password):
        raise ValueError(
            "Password must contain at least one uppercase letter"
        )

    if not re.search(r"[a-z]", password):
        raise ValueError(
            "Password must contain at least one lowercase letter"
        )

    if not re.search(r"\d", password):
        raise ValueError("Password must contain at least one number")

    if not re.search(r"[^A-Za-z0-9]", password):
        raise ValueError(
            "Password must contain at least one special character"
        )
