from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from modules.auth.auth_router import router as auth_router
from app.core.database import Base, engine
from app.core.exceptions import AppException

from modules.users.user_model import User  # noqa: F401


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


@app.get("/health")
async def health_check() -> dict[str, str]:
    return {
        "status": "UP",
    }