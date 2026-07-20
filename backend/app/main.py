from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings

from modules.auth.auth_router import router as auth_router
from modules.auction_items.item_router import (
    public_router as auction_item_detail_router,
)
from modules.auction_items.item_router import router as auction_items_router
from modules.auction_sessions.session_router import (
    router as auction_sessions_router,
)
from modules.admin.admin_router import router as admin_router
from modules.bids.bid_router import my_bids_router
from modules.bids.bid_router import router as bids_router
from modules.categories.category_router import router as categories_router
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
            "data": None,
        },
    )


app.include_router(auth_router)
app.include_router(auction_sessions_router)
app.include_router(auction_item_detail_router)
app.include_router(auction_items_router)
app.include_router(categories_router)
app.include_router(bids_router)
app.include_router(my_bids_router)
app.include_router(admin_router)


@app.get("/health")
async def health_check() -> dict[str, str]:
    return {
        "status": "UP",
    }