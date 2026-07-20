from typing import Any


def success_response(
    *,
    status: int,
    code: int,
    message: str,
    data: Any,
) -> dict[str, Any]:
    return {
        "status": status,
        "code": code,
        "message": message,
        "data": data,
    }