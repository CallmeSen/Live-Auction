from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from modules.auth.auth_router import router as auth_router
from modules.auction_sessions.session_router import (
    router as auction_sessions_router,
)
import app.models  # noqa: F401
from app.core.database import engine
from app.core.exceptions import AppException
from app.database.base import Base


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    yield

    await engine.dispose()


app = FastAPI(
    title="Auction API",
    version="1.0.0",
    lifespan=lifespan,
)


@app.exception_handler(AppException)
async def app_exception_handler(
    request: Request,
    exception: AppException,
) -> JSONResponse:
    return JSONResponse(
        status_code=exception.status_code,
        content={
            "status": exception.status_code,
            "code": exception.code,
            "message": exception.message,
            "details": exception.details,
        },
    )


app.include_router(auth_router)
app.include_router(auction_sessions_router)


@app.get("/health")
async def health_check() -> dict[str, str]:
    return {
        "status": "UP",
    }