# Live-Auction Backend Structure

This document describes the FastAPI backend under `backend/`. Paths are relative to the repository root unless noted.

---

## 1. Complete Backend Folder Tree

```
backend/
├── .dockerignore
├── .env.example
├── Dockerfile
├── alembic.ini
├── docker-entrypoint.sh
├── pytest.ini
├── requirements.txt
├── test.sql
├── test.sql.bak
│
├── alembic/
│   ├── README
│   ├── env.py
│   ├── script.py.mako
│   └── versions/
│       ├── 171bf3dda30e_create_auction_tables.py
│       ├── 4518d1a038f1_add_phone_verified_to_users.py
│       ├── a3f8c2d91e04_convert_uuid_columns_to_char36.py
│       ├── b7e4f1a92c03_add_unique_category_name_constraint.py
│       └── c8d2e5f03a14_make_item_images_image_url_nullable.py
│
├── app/
│   ├── __init__.py
│   ├── main.py                          # Application entry point
│   ├── migrations.py
│   │
│   ├── application/
│   │   ├── dto/
│   │   │   ├── auction_item_realtime_snapshot.py
│   │   │   └── auction_realtime_participant.py
│   │   ├── ports/
│   │   │   ├── auction_connection_registry.py
│   │   │   ├── auction_event_publisher.py
│   │   │   ├── auction_realtime_event_sender.py
│   │   │   └── realtime_connection.py
│   │   └── use_cases/
│   │       └── realtime/
│   │           ├── join_auction_item.py
│   │           ├── leave_auction_item.py
│   │           ├── publish_auction_item_timeline_event.py
│   │           ├── publish_bid_placed.py
│   │           ├── send_auction_chat_message.py
│   │           └── send_auction_item_snapshot.py
│   │
│   ├── commands/
│   │   ├── __init__.py
│   │   ├── create_admin.py
│   │   └── seed_db.py
│   │
│   ├── core/
│   │   ├── base.py
│   │   ├── config.py
│   │   ├── database.py                  # Async engine + get_db (primary)
│   │   ├── dependencies.py              # JWT auth dependencies
│   │   ├── exception_handler.py
│   │   ├── exceptions.py
│   │   ├── response.py
│   │   ├── security.py
│   │   ├── session.py                   # Duplicate DB session helper (with rollback)
│   │   └── storage.py
│   │
│   ├── database/
│   │   ├── __init__.py
│   │   ├── base.py                      # SQLAlchemy Base + mixins
│   │   └── types.py
│   │
│   ├── dependencies/
│   │   └── realtime_dependencies.py     # Realtime DI wiring
│   │
│   ├── domain/
│   │   └── events/
│   │       ├── auction_item_event.py
│   │       ├── auction_item_event_serialization.py
│   │       ├── auction_item_snapshot_event.py
│   │       ├── auction_lifecycle_events.py
│   │       ├── bid_placed_event.py
│   │       ├── chat_message_sent_event.py
│   │       ├── event_value_serialization.py
│   │       ├── viewer_count_updated_event.py
│   │       ├── viewer_joined_event.py
│   │       ├── viewer_left_event.py
│   │       └── websocket_error_event.py
│   │
│   ├── infrastructure/
│   │   └── realtime/
│   │       ├── in_memory_auction_connection_registry.py
│   │       ├── websocket_auction_event_publisher.py
│   │       └── websocket_auction_realtime_event_sender.py
│   │
│   ├── models/
│   │   ├── __init__.py
│   │   ├── auction_session_rule_model.py
│   │   ├── bid_model.py
│   │   ├── category_model.py
│   │   ├── enums.py
│   │   ├── image_model.py
│   │   ├── item_model.py
│   │   ├── notification_model.py
│   │   ├── notification_preference_model.py
│   │   ├── password_reset_token_model.py
│   │   ├── session_model.py
│   │   └── user_model.py
│   │
│   ├── presentation/
│   │   └── websocket/
│   │       ├── auction_item_websocket_router.py
│   │       ├── websocket_auth.py
│   │       └── websocket_participant.py
│   │
│   └── utils/
│       ├── datetime_utils.py
│       ├── email.py
│       ├── password.py
│       └── slug.py
│
├── common/
│   ├── enum.py                          # Shared domain enums
│   └── response.py
│
├── modules/                             # Feature modules (router/service/repository/schema)
│   ├── admin/
│   │   ├── admin_router.py
│   │   ├── admin_schema.py
│   │   └── admin_service.py
│   ├── auction_items/
│   │   ├── item_repository.py
│   │   ├── item_router.py
│   │   ├── item_schema.py
│   │   └── item_service.py
│   ├── auction_sessions/
│   │   ├── session_repository.py
│   │   ├── session_router.py
│   │   ├── session_schema.py
│   │   └── session_service.py
│   ├── auth/
│   │   ├── auth_router.py
│   │   ├── auth_schema.py
│   │   ├── auth_service.py
│   │   └── password_reset_repository.py
│   ├── bids/
│   │   ├── bid_repository.py
│   │   ├── bid_router.py
│   │   ├── bid_schema.py
│   │   └── bid_service.py
│   ├── categories/
│   │   ├── category_repository.py
│   │   ├── category_router.py
│   │   ├── category_schema.py
│   │   └── category_service.py
│   ├── item_images/
│   │   ├── image_router.py              # Empty placeholder
│   │   └── image_service.py
│   ├── notifications/
│   │   ├── notification_repository.py
│   │   ├── notification_router.py
│   │   ├── notification_schema.py
│   │   └── notification_service.py
│   └── users/
│       ├── notification_preference_repository.py
│       ├── user_repository.py
│       ├── user_router.py
│       ├── user_schema.py
│       ├── user_service.py
│       └── user_shema.py
│
└── tests/
    ├── __init__.py
    ├── conftest.py
    ├── fakes/
    │   ├── __init__.py
    │   ├── auction_realtime_participant.py
    │   └── realtime_connection.py
    ├── test_auction_item_events.py
    ├── test_in_memory_auction_connection_registry.py
    ├── test_realtime_snapshot_and_bid_events.py
    ├── test_realtime_use_cases.py
    └── test_send_auction_chat_message.py
```

Root-level Docker orchestration lives in `docker-compose.yml` (repo root), not inside `backend/`.

---

## 2. Purpose of Important Folders

| Folder | Purpose |
|--------|---------|
| `backend/app/` | Core application package: startup, config, DB, Clean Architecture layers, SQLAlchemy models |
| `backend/app/domain/` | Pure domain concepts (realtime event types and factory functions) with no framework imports |
| `backend/app/application/` | Use cases, DTOs, and port interfaces (abstractions) for application logic |
| `backend/app/infrastructure/` | Concrete implementations of application ports (WebSocket, in-memory registry) |
| `backend/app/presentation/` | HTTP-adjacent delivery adapters; currently WebSocket routes and auth helpers |
| `backend/app/core/` | Cross-cutting infrastructure: settings, DB engine, JWT, exceptions, file storage |
| `backend/app/models/` | SQLAlchemy ORM entity definitions mapped to MySQL tables |
| `backend/app/database/` | SQLAlchemy `Base`, UUID/timestamp mixins, custom column types |
| `backend/app/dependencies/` | FastAPI dependency providers for the realtime stack |
| `backend/app/commands/` | CLI-style scripts run at container startup (`seed_db`, `create_admin`) |
| `backend/app/utils/` | Shared helpers (datetime, email, password hashing, slug generation) |
| `backend/modules/` | Feature-oriented modules using router → service → repository → schema pattern |
| `backend/common/` | Shared enums and response helpers used across modules |
| `backend/alembic/` | Database migration scripts and Alembic environment |
| `backend/tests/` | Pytest suite for realtime use cases, events, and connection registry |

---

## 3. Clean Architecture Layers

The backend uses a **hybrid layout**:

- **`app/domain`**, **`app/application`**, **`app/infrastructure`**, **`app/presentation`** follow Clean Architecture for the **realtime/auction-item WebSocket** feature.
- **`modules/*`** follow a classic **feature module** pattern (router, service, repository, schema) for REST APIs.

### Domain (`backend/app/domain/`)

Business rules and event shapes with no FastAPI/SQLAlchemy dependencies.

| File | Key types / functions |
|------|----------------------|
| `events/auction_item_event.py` | `AuctionItemEventType`, `AuctionItemEvent` |
| `events/auction_lifecycle_events.py` | `create_auction_started_event`, `create_auction_ended_event`, `create_auction_cancelled_event`, `create_item_sold_event`, `create_item_unsold_event` |
| `events/bid_placed_event.py` | `create_bid_placed_event` |
| `events/chat_message_sent_event.py` | `create_chat_message_sent_event` |
| `events/auction_item_snapshot_event.py` | `create_auction_item_snapshot_event` |
| `events/viewer_count_updated_event.py` | `create_viewer_count_updated_event` |
| `events/viewer_joined_event.py` | `create_viewer_joined_event` |
| `events/viewer_left_event.py` | `create_viewer_left_event` |
| `events/websocket_error_event.py` | `create_websocket_error_event` |
| `events/auction_item_event_serialization.py` | Serialization helpers for WebSocket payloads |
| `events/event_value_serialization.py` | Value serialization for event `data` fields |

Shared enums also live in `backend/common/enum.py` (`AuctionSessionStatus`, `AuctionItemStatus`, `BidStatus`, etc.) and are re-exported from `backend/app/models/enums.py` for ORM use.

### Application (`backend/app/application/`)

Orchestrates use cases and defines ports (interfaces).

**Ports (interfaces)**

| File | Class | Methods |
|------|-------|---------|
| `ports/auction_connection_registry.py` | `AuctionConnectionRegistry` | `connect`, `disconnect`, `get_viewer_count`, `broadcast`, `broadcast_except` |
| `ports/auction_event_publisher.py` | `AuctionEventPublisher` | `publish` |
| `ports/auction_realtime_event_sender.py` | `AuctionRealtimeEventSender` | `send` |
| `ports/realtime_connection.py` | `RealtimeConnection` | Protocol for WebSocket-like connections |

**DTOs**

| File | Class |
|------|-------|
| `dto/auction_item_realtime_snapshot.py` | `AuctionItemRealtimeSnapshot` |
| `dto/auction_realtime_participant.py` | `AuctionRealtimeParticipant`, `ConnectParticipantResult`, `DisconnectParticipantResult` |

**Use cases (`use_cases/realtime/`)**

| File | Class | Entry point |
|------|-------|-------------|
| `join_auction_item.py` | `JoinAuctionItemUseCase` | `execute(item_id, connection, participant) -> JoinAuctionItemResult` |
| `leave_auction_item.py` | `LeaveAuctionItemUseCase` | `execute(item_id, connection) -> DisconnectParticipantResult \| None` |
| `send_auction_item_snapshot.py` | `SendAuctionItemSnapshotUseCase` | `execute(item_id, connection, snapshot)` |
| `send_auction_chat_message.py` | `SendAuctionChatMessageUseCase` | `execute(item_id, user, content) -> SendAuctionChatMessageResult` |
| `publish_bid_placed.py` | `PublishBidPlacedUseCase` | `execute(item_id, bid, bidder_name)` |
| `publish_auction_item_timeline_event.py` | `PublishAuctionItemTimelineEventUseCase` | `execute(item_id, event)` |

### Infrastructure (`backend/app/infrastructure/`)

Concrete adapters implementing application ports.

| File | Class | Implements |
|------|-------|------------|
| `realtime/in_memory_auction_connection_registry.py` | `InMemoryAuctionConnectionRegistry` | `AuctionConnectionRegistry` |
| `realtime/websocket_auction_event_publisher.py` | `WebSocketAuctionEventPublisher` | `AuctionEventPublisher` |
| `realtime/websocket_auction_realtime_event_sender.py` | `WebSocketAuctionRealtimeEventSender` | `AuctionRealtimeEventSender` |

> **Note:** The in-memory connection registry requires a **single Uvicorn worker**. Multiple workers need a shared store (e.g. Redis).

### Presentation / API (`backend/app/presentation/` + `backend/modules/*`)

| Layer | Location | Responsibility |
|-------|----------|----------------|
| WebSocket presentation | `app/presentation/websocket/` | WebSocket endpoint, auth, participant building |
| REST presentation | `modules/*/…_router.py` | HTTP route handlers, request/response mapping |
| Schemas | `modules/*/…_schema.py` | Pydantic request/response models |

**Dependency direction:** `presentation → application → domain` and `infrastructure → application (ports)`. Feature modules (`modules/`) call repositories/services directly and integrate realtime via `app.dependencies.realtime_dependencies`.

---

## 4. Application Startup File

**File:** `backend/app/main.py`

| Element | Name / behavior |
|---------|-----------------|
| FastAPI app | `app = FastAPI(title="Auction API", version="1.0.0", lifespan=lifespan)` |
| Lifespan | `lifespan(app)` — on startup runs `Base.metadata.create_all` via async engine; on shutdown calls `engine.dispose()` |
| CORS | `CORSMiddleware` using `settings.cors_origin_list` |
| Static files | Mounts `/uploads` from local `uploads/` directory |
| Exception handler | `app_exception_handler` for `AppException` |
| Health check | `GET /health` → `health_check()` |

**Registered routers (in order):**

```python
app.include_router(auth_router)
app.include_router(auction_sessions_router)
app.include_router(auction_item_detail_router)   # public_router
app.include_router(auction_items_router)
app.include_router(categories_router)
app.include_router(bids_router)
app.include_router(my_bids_router)
app.include_router(admin_router)
app.include_router(user_router)
app.include_router(notification_router)
app.include_router(auction_item_websocket_router)
```

**Run locally:**

```bash
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

**Docker command** (from `docker-compose.yml`):

```bash
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

---

## 5. Dependency Injection Configuration

FastAPI `Depends()` is used throughout. There is no central DI container; providers are factory functions in routers and dedicated dependency modules.

### Auth dependencies (`backend/app/core/dependencies.py`)

| Function | Returns | Purpose |
|----------|---------|---------|
| `get_current_user_id` | `uuid.UUID` | Validates JWT Bearer token, extracts `sub` claim |
| `get_current_active_user` | `User` | Loads user; rejects `BANNED` or non-`ACTIVE` |
| `get_current_admin_user` | `User` | Requires `UserRole.ADMIN` |

Uses `HTTPBearer` security scheme and `get_db` from `app.core.database`.

### Realtime dependencies (`backend/app/dependencies/realtime_dependencies.py`)

Module-level singletons:

- `_auction_connection_registry` → `InMemoryAuctionConnectionRegistry`
- `_auction_event_publisher` → `WebSocketAuctionEventPublisher`
- `_auction_realtime_event_sender` → `WebSocketAuctionRealtimeEventSender`
- `_send_auction_item_snapshot_use_case` → `SendAuctionItemSnapshotUseCase`
- `_publish_bid_placed_use_case` → `PublishBidPlacedUseCase`
- `_publish_auction_item_timeline_event_use_case` → `PublishAuctionItemTimelineEventUseCase`

Provider functions:

| Function | Returns |
|----------|---------|
| `get_auction_connection_registry()` | `InMemoryAuctionConnectionRegistry` |
| `get_publish_bid_placed_use_case()` | `PublishBidPlacedUseCase` |
| `get_publish_auction_item_timeline_event_use_case()` | `PublishAuctionItemTimelineEventUseCase` |
| `get_leave_auction_item_use_case()` | `LeaveAuctionItemUseCase` |
| `get_join_auction_item_use_case(db)` | `JoinAuctionItemUseCase` (injects `AuctionItemRepository`, `get_db`) |
| `get_send_auction_chat_message_use_case(db)` | `SendAuctionChatMessageUseCase` |

### Feature module DI (per router)

| Router file | Factory | Builds |
|-------------|---------|--------|
| `modules/auction_sessions/session_router.py` | `get_auction_session_service()` | `AuctionSessionService` |
| `modules/auction_items/item_router.py` | `get_auction_item_service(storage_service)` | `AuctionItemService` |
| `modules/bids/bid_router.py` | `get_bid_service()` | `BidService` |
| `modules/admin/admin_router.py` | `get_auction_session_service()` | `AuctionSessionService` (admin session ops) |
| `app/core/storage.py` | `get_storage_service()` | `LocalStorageService` or S3 implementation |

Repositories are typically instantiated inline (`AuctionItemRepository()`, `AuctionSessionRepository()`, etc.) inside these factories.

---

## 6. Database Configuration

### Settings (`backend/app/core/config.py`)

`Settings` (Pydantic `BaseSettings`) loads from `backend/.env`:

| Setting | Env variable | Purpose |
|---------|--------------|---------|
| `database_url` | `DATABASE_URL` | Async MySQL URL (`mysql+asyncmy://…`) |
| `jwt_secret_key` | `JWT_SECRET_KEY` | JWT signing secret |
| `jwt_algorithm` | `JWT_ALGORITHM` | Default `HS256` |
| `access_token_expire_minutes` | `ACCESS_TOKEN_EXPIRE_MINUTES` | Token TTL |
| `cors_origins` | `CORS_ORIGINS` | Comma-separated allowed origins |
| `storage_backend` | `STORAGE_BACKEND` | `local` or S3 |
| `upload_dir` | `UPLOAD_DIR` | Local upload directory |
| `max_upload_size_mb` | `MAX_UPLOAD_SIZE_MB` | Upload size limit |
| SMTP / password-reset settings | `SMTP_*`, `FRONTEND_RESET_PASSWORD_URL`, etc. | Email flows |

Singleton: `settings = Settings()`

### Example env (`backend/.env.example`)

```
DATABASE_URL=mysql+asyncmy://auction_user:change_this_user_password@localhost:3307/auction_db
JWT_SECRET_KEY=replace_with_a_long_random_secret
```

### Migrations (`backend/alembic/`)

- Config: `backend/alembic.ini`
- Environment: `backend/alembic/env.py` — converts `mysql+asyncmy` → `mysql+pymysql` for sync Alembic runs
- Target metadata: `Base.metadata` from `app.database.base`
- Models imported via `import app.models`

### Startup schema creation

`app/main.py` lifespan also calls `Base.metadata.create_all` on startup (in addition to Alembic migrations).

---

## 7. SQLAlchemy Session Creation

**Primary module:** `backend/app/core/database.py`

```python
engine = create_async_engine(
    settings.database_url,
    echo=True,
    pool_pre_ping=True,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
```

**Also exists:** `backend/app/core/session.py` — duplicate engine/session setup; `get_db()` additionally rolls back on exception. Routers and dependencies import from `app.core.database`.

**Base and mixins:** `backend/app/database/base.py`

| Type | Purpose |
|------|---------|
| `Base` | `DeclarativeBase` for all ORM models |
| `UUIDPrimaryKeyMixin` | `id: UUID` primary key |
| `CreatedAtMixin` | `created_at` column |
| `TimestampMixin` | `created_at` + `updated_at` |

**Custom types:** `backend/app/database/types.py` — `UUIDString` column type (CHAR(36)).

---

## 8. Environment Configuration

| Source | Path | Notes |
|--------|------|-------|
| Local dev example | `backend/.env.example` | Template for host-run backend |
| Runtime settings | `backend/.env` | Loaded by `Settings` (`BASE_DIR / ".env"`) |
| Docker Compose | `.env` at repo root | Variables injected into `backend` service |

**Docker Compose backend environment** (`docker-compose.yml`):

- `DATABASE_URL`, `JWT_SECRET_KEY`, `JWT_ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`
- `STORAGE_BACKEND`, `UPLOAD_DIR`, `MAX_UPLOAD_SIZE_MB`
- SMTP and password-reset variables

**Volumes:**

- `./backend:/app` — live code mount
- `uploads_data:/app/uploads` — persistent uploads

---

## 9. Docker Configuration

### Backend Dockerfile (`backend/Dockerfile`)

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
EXPOSE 8000
```

### Entrypoint (`backend/docker-entrypoint.sh`)

Runs `python -m app.commands.seed_db` before the main command, then `exec "$@"`.

### Compose services (repo root `docker-compose.yml`)

| Service | Image / build | Port | Depends on |
|---------|---------------|------|------------|
| `mysql` | `mysql:8.0` | `${MYSQL_HOST_PORT}:${MYSQL_CONTAINER_PORT}` | — |
| `backend` | `build: ./backend` | `${BACKEND_HOST_PORT}:8000` | `mysql` (healthy) |
| `frontend` | `build: ./frontend` | `${FRONTEND_HOST_PORT}:5173` | `backend` |

MySQL healthcheck uses `mysqladmin ping`. Backend waits for healthy MySQL before starting.

---

## 10. Auction-Related Components

### 10.1 Routers

#### Auction sessions — `modules/auction_sessions/session_router.py`

Prefix: `/api/v1/auction-sessions`

| HTTP | Handler | Service method |
|------|---------|----------------|
| `GET ""` | `list_auction_sessions` | `AuctionSessionService.list_sessions` |
| `GET /mine` | `get_mine_auction_sessions` | `AuctionSessionService.list_sessions` (seller filter) |
| `GET /{session_id}` | `get_auction_session_detail` | `AuctionSessionService.get_session_detail` |
| `POST ""` | `create_auction_session` | `AuctionSessionService.create_session` |
| `PATCH /{session_id}/start` | `start_auction_session` | `AuctionSessionService.start_session` |

#### Auction items — `modules/auction_items/item_router.py`

Two routers:

**`public_router`** — prefix `/api/v1/auction-items`

| HTTP | Handler | Service method |
|------|---------|----------------|
| `GET ""` | `list_auction_items` | `AuctionItemService.list_items` |
| `GET /{item_id}` | `get_auction_item_detail` | `AuctionItemService.get_item_detail` |
| `PATCH /{item_id}` | `update_auction_item` | `AuctionItemService.update_item` |
| `DELETE /{item_id}` | `delete_auction_item` | `AuctionItemService.delete_item` |
| `POST /{item_id}/images` | `upload_auction_item_image` | `AuctionItemService.upload_image` |

**`router`** — prefix `/api/v1/auction-sessions` (auth required)

| HTTP | Handler | Service method |
|------|---------|----------------|
| `POST /{session_id}/items` | `create_auction_item` | `AuctionItemService.create_item` |

#### Bids — `modules/bids/bid_router.py`

**`router`** — prefix `/api/v1/auction-items`

| HTTP | Handler | Service method |
|------|---------|----------------|
| `POST /{item_id}/bids` | `place_bid` | `BidService.place_bid` |

**`my_bids_router`** — prefix `/api/v1/bids`

| HTTP | Handler | Service method |
|------|---------|----------------|
| `GET /my` | `list_my_bids` | `BidService.list_my_bids` |

#### Admin auction session ops — `modules/admin/admin_router.py`

Prefix: `/api/v1/admin`

| HTTP | Handler | Service method |
|------|---------|----------------|
| `GET /auction-sessions` | `list_admin_auction_sessions` | `AuctionSessionService.list_sessions` |
| `GET /auction-sessions/pending` | `list_pending_auction_sessions` | `AuctionSessionService.list_sessions` |
| `PATCH /auction-sessions/{session_id}/approve` | `approve_auction_session` | `AuctionSessionService.approve_session` |
| `PATCH /auction-sessions/{session_id}/reject` | `reject_auction_session` | `AuctionSessionService.reject_session` |
| `PATCH /auction-sessions/{session_id}/cancel` | `cancel_auction_session` | `AuctionSessionService.cancel_session` |

#### WebSocket realtime — `app/presentation/websocket/auction_item_websocket_router.py`

| Protocol | Handler | Use cases |
|----------|---------|-----------|
| `WS /ws/auction-items/{item_id}` | `auction_item_viewer_websocket` | `JoinAuctionItemUseCase`, `LeaveAuctionItemUseCase`, `SendAuctionChatMessageUseCase` |

Query params: `token` (optional JWT), `sessionId` (client reconnect dedupe).

Incoming message types: `PING`, `SEND_CHAT_MESSAGE`. Plain-text `ping` also supported.

Helper functions: `_send_pong`, `_handle_incoming_message`.

WebSocket auth: `resolve_websocket_user` in `websocket_auth.py`.  
Participant builder: `build_auction_realtime_participant` in `websocket_participant.py`.

---

### 10.2 Services

#### `AuctionSessionService` — `modules/auction_sessions/session_service.py`

| Method | Purpose |
|--------|---------|
| `get_session_detail(db, session_id)` | Full session with items, seller, rules |
| `list_sessions(db, filters)` | Paginated session list |
| `create_session(db, seller_id, request)` | Creates session + `AuctionSessionRule` |
| `start_session(db, session_id, current_user)` | Seller starts session → `ACTIVE` |
| `approve_session(db, session_id)` | Admin approves scheduled session |
| `reject_session(db, session_id, reason)` | Admin rejects → `CANCELLED`, cancels UNSOLD items |
| `cancel_session(db, session_id, reason)` | Seller cancels scheduled session |
| `_synchronize_time_based_statuses(db)` | Delegates to repository time sync |
| `_item_is_available_for_auction(item)` | Static: `item.status == UNSOLD` |
| `_cancel_unsold_session_items(session)` | Static: UNSOLD → CANCELLED |
| `_activate_session_items(session, current_time)` | Sets `opened_at` on UNSOLD items |
| `_publish_auction_started_events(session)` | Publishes `AUCTION_STARTED` realtime events |
| `_get_primary_image_url(item)` | Helper for list views |

#### `AuctionItemService` — `modules/auction_items/item_service.py`

| Method | Purpose |
|--------|---------|
| `list_items(db, filters)` | Paginated item list with session/category/seller |
| `get_item_detail(db, item_id)` | Item detail with bids, images, session rules |
| `create_item(db, session_id, seller_id, request)` | Add item to session |
| `update_item(db, item_id, seller_id, request)` | Update item fields |
| `delete_item(db, item_id, seller_id)` | Remove item |
| `upload_image(db, item_id, seller_id, …)` | Upload via `StorageService`, create `ItemImage` |
| `_synchronize_session_statuses(db, session_id)` | Sync session ACTIVE/ENDED by time |
| `_map_list_item(item)` | Maps ORM entity to list DTO |

#### `BidService` — `modules/bids/bid_service.py`

| Method | Purpose |
|--------|---------|
| `place_bid(db, item_id, bidder, request)` | Validates session/item, creates bid, updates prices, publishes realtime |
| `list_my_bids(db, filters)` | Bidder's bid history with outcome |
| `_get_outcome(item, session, bid, bidder_id)` | Computes `MyBidOutcome` (LEADING/OUTBID/WON/LOST) |

---

### 10.3 Repositories

#### `AuctionSessionRepository` — `modules/auction_sessions/session_repository.py`

| Type / method | Purpose |
|---------------|---------|
| `SessionListFilters` | Filter dataclass (page, size, status, keyword, category_id, seller_id, excluded_statuses) |
| `find_by_id(db, session_id)` | Load session by ID |
| `find_detail_by_id(db, session_id)` | Eager-load items, rules, seller |
| `find_by_id_for_update(db, session_id)` | Row lock for mutations |
| `list_sessions(db, filters)` | Paginated query |
| `create(db, session, rules)` | Persist session + rules |
| `synchronize_time_based_statuses(db, current_time)` | Auto ACTIVE/ENDED by schedule |
| `_finalize_ended_items(db, session, current_time)` | UNSOLD + winning bid → SOLD; no bid stays UNSOLD |
| `_build_list_conditions(filters)` | SQLAlchemy filter builder |

#### `AuctionItemRepository` — `modules/auction_items/item_repository.py`

| Type / method | Purpose |
|---------------|---------|
| `ItemListFilters` | Filter dataclass (page, page_size, status, session_id, category_id, keyword, sort) |
| `list_items(db, filters)` | Paginated item query |
| `find_detail_by_id(db, item_id)` | Detail with session, rules, bids, images |
| `find_by_id_for_update(db, item_id)` | Row lock for bidding |
| `find_by_id_with_session(db, item_id)` | Item + session + rules |
| `get_realtime_snapshot(db, item_id)` | Snapshot for WebSocket join |
| `exists(db, item_id)` | Existence check |
| `create(db, item)` | Insert item |
| `delete(db, item)` | Delete item |
| `create_image(db, image)` | Insert `ItemImage` |
| `get_next_sort_order(db, item_id)` | Next image sort order |
| `unset_primary_images(db, item_id)` | Clear primary flag on images |
| `_build_list_conditions(filters)` | SQLAlchemy filter builder |

#### `BidRepository` — `modules/bids/bid_repository.py`

| Type / method | Purpose |
|---------------|---------|
| `MyBidListFilters` | Filter dataclass (bidder_id, page, page_size, outcome) |
| `find_winning_by_item_id(db, item_id)` | Current WINNING bid |
| `list_all_by_bidder(db, bidder_id)` | All bids for a user |
| `create(db, bid)` | Insert bid record |

---

### 10.4 SQLAlchemy Models

| Model | File | Table | Key relationships |
|-------|------|-------|-------------------|
| `AuctionSession` | `app/models/session_model.py` | `auction_sessions` | `seller` → `User`, `items`, `rules`, `bids` |
| `AuctionSessionRule` | `app/models/auction_session_rule_model.py` | `auction_session_rules` | `session` → `AuctionSession` (1:1) |
| `AuctionItem` | `app/models/item_model.py` | `auction_items` | `session`, `seller`, `category`, `winner`, `bids`, `images` |
| `ItemImage` | `app/models/image_model.py` | `item_images` | `item` → `AuctionItem` |
| `Bid` | `app/models/bid_model.py` | `bids` | `item`, `session`, `bidder` → `User` |
| `Category` | `app/models/category_model.py` | `categories` | Referenced by `AuctionItem.category_id` |
| `User` | `app/models/user_model.py` | `users` | Seller, bidder, winner roles |

All models registered in `app/models/__init__.py`.

**Status enums** (from `common/enum.py`, used in ORM via `app/models/enums.py`):

- `AuctionSessionStatus`: `SCHEDULED`, `ACTIVE`, `ENDED`, `CANCELLED`
- `AuctionItemStatus`: `SOLD`, `UNSOLD`, `CANCELLED`
- `BidStatus`: `WINNING`, `OUTBID`

---

### 10.5 Pydantic Schemas

#### Session schemas — `modules/auction_sessions/session_schema.py`

| Schema | Purpose |
|--------|---------|
| `CreateAuctionSessionRequest` | Create session + min_increment |
| `AuctionSessionRuleData` | Rule response fragment |
| `CreateAuctionSessionData` / `CreateAuctionSessionResponse` | Create response |
| `AuctionSessionListItem` / `AuctionSessionListData` / `ListAuctionSessionsResponse` | List response |
| `AuctionSessionSellerData` | Seller summary |
| `AuctionSessionItemSummary` | Item summary in session detail |
| `AuctionSessionDetailData` / `GetAuctionSessionDetailResponse` | Detail response |
| `StartAuctionSessionData` / `StartAuctionSessionResponse` | Start response |
| `ApproveAuctionSessionData` / `ApproveAuctionSessionResponse` | Admin approve |
| `RejectAuctionSessionRequest` / `RejectAuctionSessionData` / `RejectAuctionSessionResponse` | Admin reject |
| `CancelAuctionSessionRequest` / `CancelAuctionSessionData` / `CancelAuctionSessionResponse` | Seller cancel |

#### Item schemas — `modules/auction_items/item_schema.py`

| Schema | Purpose |
|--------|---------|
| `AuctionItemSortBy`, `SortOrder` | List sorting enums |
| `CreateAuctionItemRequest` / `CreateAuctionItemData` / `CreateAuctionItemResponse` | Create |
| `UpdateAuctionItemRequest` / `UpdateAuctionItemResponse` | Update |
| `DeleteAuctionItemData` / `DeleteAuctionItemResponse` | Delete |
| `AuctionItemSellerData` | Seller in detail |
| `AuctionItemSessionData` | Session fragment (includes `sellerId`, `minIncrement`, `endTime`) |
| `AuctionItemImageData` | Image in detail |
| `AuctionItemBidData` | Bid in detail |
| `AuctionItemDetailData` / `GetAuctionItemDetailResponse` | Detail |
| `AuctionItemListCategoryData` / `AuctionItemListSessionData` / `AuctionItemListItem` / `AuctionItemListData` / `ListAuctionItemsResponse` | List |
| `UploadAuctionItemImageData` / `UploadAuctionItemImageResponse` | Image upload |

#### Bid schemas — `modules/bids/bid_schema.py`

| Schema | Purpose |
|--------|---------|
| `PlaceBidRequest` | Bid amount |
| `PlaceBidData` / `PlaceBidResponse` | Place bid response |
| `MyBidListItem` / `MyBidListData` / `ListMyBidsResponse` | My bids list |

---

### 10.6 Realtime Use Cases (Application Layer)

| Use case | Triggered by | Publishes |
|----------|--------------|-----------|
| `JoinAuctionItemUseCase` | WebSocket connect | `VIEWER_JOINED`, `VIEWER_COUNT_UPDATED`, `AUCTION_ITEM_SNAPSHOT` |
| `LeaveAuctionItemUseCase` | WebSocket disconnect | `VIEWER_LEFT`, `VIEWER_COUNT_UPDATED` |
| `SendAuctionChatMessageUseCase` | `SEND_CHAT_MESSAGE` WS message | `CHAT_MESSAGE_SENT` |
| `SendAuctionItemSnapshotUseCase` | Called from join flow | `AUCTION_ITEM_SNAPSHOT` to one connection |
| `PublishBidPlacedUseCase` | `BidService.place_bid` | `BID_PLACED` |
| `PublishAuctionItemTimelineEventUseCase` | `AuctionSessionService` lifecycle | `AUCTION_STARTED`, `AUCTION_ENDED`, etc. |

---

### 10.7 Domain Events (`AuctionItemEventType`)

Defined in `app/domain/events/auction_item_event.py`:

```
VIEWER_COUNT_UPDATED
VIEWER_JOINED
VIEWER_LEFT
AUCTION_ITEM_SNAPSHOT
BID_PLACED
CHAT_MESSAGE_SENT
AUCTION_STARTED
AUCTION_ENDED
AUCTION_CANCELLED
ITEM_SOLD
ITEM_UNSOLD
```

Factory functions live in the corresponding files under `app/domain/events/`.

---

### 10.8 Auction Data Flow Summary

```
Seller                          Bidder                         Admin
  │                               │                              │
  ├─ POST /auction-sessions ─────►│                              │
  ├─ POST /auction-sessions/{id}/items                            │
  ├─ PATCH /auction-sessions/{id}/start                         │
  │                               ├─ GET /auction-items/{id}     │
  │                               ├─ WS /ws/auction-items/{id}   │
  │                               ├─ POST /auction-items/{id}/bids
  │                               │                              │
  │                               │         ◄── approve/reject/cancel
  │                               │             /admin/auction-sessions/…
  ▼                               ▼                              ▼
AuctionSessionService        BidService                   AuctionSessionService
AuctionItemService                │                              │
       │                          │                              │
       ▼                          ▼                              ▼
AuctionSessionRepository    BidRepository              AuctionSessionRepository
AuctionItemRepository       AuctionItemRepository
       │                          │
       ▼                          ▼
AuctionSession, AuctionItem, Bid, AuctionSessionRule (SQLAlchemy models)
       │
       └──► PublishBidPlacedUseCase / PublishAuctionItemTimelineEventUseCase
                    │
                    ▼
            WebSocketAuctionEventPublisher → connected clients
```

---

## Related Non-Auction Modules (context)

These support auction flows but are not auction-specific:

| Module | Role in auctions |
|--------|------------------|
| `modules/auth/` | Login/JWT used by bid and session routes |
| `modules/users/` | User lookup, notification preferences |
| `modules/categories/` | Item categorization |
| `modules/notifications/` | Bid/session notification delivery |
| `modules/categories/category_router.py` | Public category listing for item filters |

---

*Generated from the Live-Auction backend codebase. Re-run this analysis when adding new modules or moving files.*
