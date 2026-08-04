def create_websocket_error_event(
    *,
    code: str,
    message: str,
) -> dict:
    return {
        "type": "ERROR",
        "data": {
            "code": code,
            "message": message,
        },
    }
