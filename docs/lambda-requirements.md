# Lambda Backend Requirements — Live-Auction

This document defines how the **complete** Auction backend will operate on AWS Lambda, based on the **current** codebase under `backend/` and `frontend/`. Items are tagged:

| Tag | Meaning |
|-----|---------|
| **READY** | Exists and can be reused with minimal or no change |
| **NEEDS REFACTORING** | Exists but must change for Lambda |
| **MISSING** | Not implemented today |
| **RISK** | Known concurrency, cost, or migration risk |
| **DECISION REQUIRED** | Team must choose before implementation |

---

# Lambda Backend Goal

The Auction application will use **AWS Lambda as its primary backend compute platform**, replacing the current long-running EC2/Docker Uvicorn deployment as the **final** architecture.

## Target architecture (confirmed)

| Component | Target | Status |
|-----------|--------|--------|
| Backend compute | **Fully Lambda-based** | **DECISION REQUIRED** — migration target |
| Primary database | **Lambda + RDS MySQL** | **READY** (same schema/models) |
| HTTP API | **API Gateway HTTP API → FastAPI Lambda (Mangum)** | **NEEDS REFACTORING** |
| Real-time | **API Gateway WebSocket API → WebSocket Lambdas + DynamoDB** | **NEEDS REFACTORING** |
| Scheduled work | **EventBridge Scheduler → scheduler Lambda** | **MISSING** (today: lazy sync on reads) |
| Image pipeline | **S3 + S3 event → image-processing Lambda** | **NEEDS REFACTORING** (today: local disk) |
| Async notifications | **SQS → notification worker Lambda** (recommended) | **MISSING** (today: sync DB insert) |

## EC2 removal

| Phase | EC2 / Docker Uvicorn |
|-------|----------------------|
| Migration | **Temporarily retained** as fallback while HTTP, bids, scheduler, and WebSocket are validated on Lambda |
| Final | **Removed completely** once API Gateway HTTP + WebSocket, RDS Proxy, S3 uploads, and EventBridge scheduler are production-stable |

---

# Existing FastAPI Application

## Entry point — **READY**

| Item | Location |
|------|----------|
| Application | `backend/app/main.py` |
| FastAPI instance | `app = FastAPI(title="Auction API", version="1.0.0", lifespan=lifespan)` |
| Health | `GET /health` |

## Current routers — **READY** (HTTP only)

| Router module | Prefix | Notes |
|---------------|--------|-------|
| `modules/auth/auth_router.py` | `/api/v1/auth` | register, login, forgot/reset password |
| `modules/auction_sessions/session_router.py` | `/api/v1/auction-sessions` | CRUD-ish session ops |
| `modules/auction_items/item_router.py` | `/api/v1/auction-sessions` + `/api/v1/auction-items` | Two routers |
| `modules/bids/bid_router.py` | `/api/v1/auction-items`, `/api/v1/bids` | place bid, my bids |
| `modules/categories/category_router.py` | `/api/v1/categories` | public list + admin CRUD |
| `modules/users/user_router.py` | `/api/v1/users` | profile, notification prefs |
| `modules/admin/admin_router.py` | `/api/v1/admin` | users, session approve/reject/cancel |
| `modules/notifications/notification_router.py` | `/api/v1/notifications` | list, mark read |
| `app/presentation/websocket/auction_item_websocket_router.py` | `WS /ws/auction-items/{item_id}` | **NEEDS REFACTORING** for Lambda |

## Middleware — **READY** / **NEEDS REFACTORING**

| Middleware | File | Lambda note |
|------------|------|-------------|
| `CORSMiddleware` | `app/main.py` | **READY** — keep; also configure API Gateway CORS |
| `StaticFiles` `/uploads` | `app/main.py` | **NEEDS REFACTORING** — replace with S3 + CloudFront |
| `AppException` handler | `app/main.py` | **READY** |

## Authentication dependencies — **READY**

| Function | File | Role |
|----------|------|------|
| `get_current_user_id` | `app/core/dependencies.py` | JWT Bearer → UUID |
| `get_current_active_user` | `app/core/dependencies.py` | Active, non-banned user |
| `get_current_admin_user` | `app/core/dependencies.py` | `UserRole.ADMIN` |

JWT logic: `app/core/security.py` (`create_access_token`, `decode_access_token`, `hash_password`, `verify_password`).

## Dependency injection — **READY** (pattern)

| Area | Location |
|------|----------|
| Auth DI | `app/core/dependencies.py` |
| Realtime singletons | `app/dependencies/realtime_dependencies.py` |
| Per-router factories | `get_*_service()` in each `*_router.py` |

**NEEDS REFACTORING:** Module-level singletons in `realtime_dependencies.py` (`InMemoryAuctionConnectionRegistry`) cannot survive Lambda HTTP/WebSocket split.

## SQLAlchemy configuration — **READY** / **NEEDS REFACTORING**

| Item | Location | Value |
|------|----------|-------|
| Engine | `app/core/database.py` | `create_async_engine(settings.database_url, pool_pre_ping=True)` |
| Session factory | `app/core/database.py` | `AsyncSessionLocal` — `expire_on_commit=False`, `autoflush=False` |
| Request session | `get_db()` | Yields session; closes in `finally` (no auto-rollback in `database.py`) |
| Driver | `requirements.txt` | `asyncmy==0.2.11` |
| SQLAlchemy | `requirements.txt` | `2.0.51` |
| URL format | `.env.example` | `mysql+asyncmy://USER:PASSWORD@HOST:3306/DATABASE` |

**NEEDS REFACTORING for Lambda:**

- Disable or shrink connection pool per invocation (prefer **RDS Proxy** + `pool_size=1` or NullPool pattern)
- Do not call `engine.dispose()` every invocation on warm containers
- Remove `Base.metadata.create_all()` from startup path

## Async session lifecycle — **READY** (pattern)

Services call `await db.commit()` / `await db.rollback()` explicitly. One `AsyncSession` per HTTP request via `Depends(get_db)`.

## WebSocket routes — **NEEDS REFACTORING**

| Route | Handler | Use cases |
|-------|---------|-----------|
| `WS /ws/auction-items/{item_id}` | `auction_item_viewer_websocket` | Join, leave, chat, ping |

Registry: `InMemoryAuctionConnectionRegistry` (`app/infrastructure/realtime/in_memory_auction_connection_registry.py`) — **process memory only**.

## Background tasks — **NEEDS REFACTORING**

| Task | Location | Today | Lambda target |
|------|----------|-------|---------------|
| Password reset email | `auth_router.forgot_password` → `BackgroundTasks` | In-process after response | **SQS + notification/email Lambda** |
| WebSocket publish after bid | `BidService.place_bid` | Await after commit | **KEEP sync** or API Gateway Management API |
| Session time sync | Read endpoints | Lazy commit on GET | **EventBridge scheduler Lambda** |

## Environment variables — **READY**

See `docs/environment-variables.md`. Required: `DATABASE_URL`, `JWT_SECRET_KEY`. Optional: SMTP, storage, CORS.

## Docker configuration — **READY** (current deploy only)

| File | Purpose |
|------|---------|
| `backend/Dockerfile` | Python 3.11, Uvicorn |
| `docker-compose.yml` | MySQL + backend + frontend |
| `docker-entrypoint.sh` | Runs `seed_db` then Uvicorn |

**NEEDS REFACTORING:** Docker image may become **Lambda container image** for HTTP API function (recommended due to native deps).

---

## Can FastAPI run through Mangum?

| Question | Answer | Tag |
|----------|--------|-----|
| Can HTTP routes run via Mangum? | **Yes** — all REST routers are standard ASGI | **READY** |
| Which files reuse without changes? | Routers, services, repositories, models, schemas, `AppException`, JWT helpers, most use cases except realtime wiring | **READY** |
| Which require refactoring? | `main.py` lifespan, `StaticFiles`, WebSocket router, `realtime_dependencies.py`, engine/pool init, file upload path | **NEEDS REFACTORING** |
| What cannot move directly? | FastAPI `WebSocket` on same Lambda ASGI app for production scale; in-memory registry; local `uploads/`; `create_all` on startup; Uvicorn multi-connection model | **MISSING** / **RISK** |

---

# HTTP API Requirements

All endpoints below **exist today** unless marked **MISSING**.

Legend: **Freq** = expected request frequency (estimate for medium auction); **Duration** = typical Lambda duration; **SQS** = should async work be queued.

## Authentication

### Register — **READY**

| Field | Value |
|-------|-------|
| Endpoint | `POST /api/v1/auth/register` |
| Auth | None |
| Role | None |
| Request | `RegisterRequest`: `email`, `password`, `fullName`, `phone` |
| Response | `RegisterResponse` → `RegisterUserData` |
| Tables | `users` INSERT |
| Duration | 200–500 ms |
| Freq | Low (10–50/day) |
| Return immediately | Yes |
| SQS | No |

### Login — **READY**

| Field | Value |
|-------|-------|
| Endpoint | `POST /api/v1/auth/login` |
| Auth | None |
| Request | `LoginRequest`: `email`, `password` |
| Response | `LoginResponse` → `accessToken`, `user` |
| Tables | `users` SELECT |
| Duration | 200–500 ms |
| Freq | Medium (100–500/day) |
| SQS | No |

### Forgot / reset password — **READY** / **NEEDS REFACTORING**

| Endpoint | Method | Auth | SQS |
|----------|--------|------|-----|
| `/api/v1/auth/forgot-password` | POST | No | **Yes** — email send |
| `/api/v1/auth/reset-password` | POST | No | No |

Tables: `users`, `password_reset_tokens`.

---

## Current user — **READY**

| Endpoint | Method | Auth | Role |
|----------|--------|------|------|
| `GET /api/v1/users/me` | GET | Bearer | Any |
| `PATCH /api/v1/users/me` | PATCH | Bearer | Any |
| `GET /api/v1/users/me/notification-preferences` | GET | Bearer | Any |
| `PATCH /api/v1/users/me/notification-preferences` | PATCH | Bearer | Any |

Tables: `users`, `notification_preferences`.

Duration: 100–300 ms. Freq: low–medium.

---

## Auction sessions — **READY** / **MISSING**

| Operation | Endpoint | Method | Auth | Role | Tag |
|-----------|----------|--------|------|------|-----|
| List (public) | `/api/v1/auction-sessions` | GET | No | — | **READY** |
| List mine | `/api/v1/auction-sessions/mine` | GET | Yes | Seller | **READY** |
| Detail | `/api/v1/auction-sessions/{id}` | GET | No | — | **READY** |
| Create | `/api/v1/auction-sessions` | POST | Yes | Any authenticated | **READY** |
| Start | `/api/v1/auction-sessions/{id}/start` | PATCH | Yes | Seller or ADMIN | **READY** |
| **End session** | — | — | — | — | **MISSING** HTTP endpoint; today auto via `synchronize_time_based_statuses` |
| Admin approve | `/api/v1/admin/auction-sessions/{id}/approve` | PATCH | Yes | ADMIN | **READY** |
| Admin reject | `/api/v1/admin/auction-sessions/{id}/reject` | PATCH | Yes | ADMIN | **READY** |
| Admin cancel | `/api/v1/admin/auction-sessions/{id}/cancel` | PATCH | Yes | ADMIN | **READY** |

**Create request:** `CreateAuctionSessionRequest` — `title`, `description`, `startTime`, `endTime`, `minIncrement`.

**Tables:** `auction_sessions`, `auction_session_rules`, `auction_items` (reads), `notifications` (approve/reject/cancel).

**Start/end duration:** 300 ms–2 s (start includes optional WebSocket timeline publish).

**End session on Lambda:** Implement in **scheduler Lambda** (not HTTP). **MISSING** as dedicated job.

---

## Auction items — **READY** / **NEEDS REFACTORING**

| Operation | Endpoint | Method | Auth | Role |
|-----------|----------|--------|------|------|
| List | `GET /api/v1/auction-items` | GET | No | — |
| Detail | `GET /api/v1/auction-items/{id}` | GET | No | — |
| Create | `POST /api/v1/auction-sessions/{session_id}/items` | POST | Yes | Session seller |
| Update | `PATCH /api/v1/auction-items/{id}` | PATCH | Yes | Item seller |
| Delete | `DELETE /api/v1/auction-items/{id}` | DELETE | Yes | Item seller |
| Upload image | `POST /api/v1/auction-items/{id}/images` | POST | Yes | Item seller |

**Create request:** `CreateAuctionItemRequest` — `categoryId`, `title`, `description`, `startingPrice`.

**Upload today:** multipart to Lambda **NEEDS REFACTORING** → presigned S3 URL flow.

**Tables:** `auction_items`, `item_images`, `categories`, `auction_sessions`.

**Image upload SQS:** **Yes** — processing after S3 put.

---

## Bids — **READY** / **RISK**

| Operation | Endpoint | Method | Auth | Role |
|-----------|----------|--------|------|------|
| Place bid | `POST /api/v1/auction-items/{item_id}/bids` | POST | Yes | ACTIVE user, not session seller |
| My bids | `GET /api/v1/bids/my` | GET | Yes | Bidder |

**Request:** `PlaceBidRequest` — `amount` (Decimal > 0).

**Response:** `PlaceBidResponse` → `PlaceBidData`.

**Tables:** `auction_items` (FOR UPDATE), `bids`, `auction_sessions`, `auction_session_rules`, `notifications`.

**Duration:** 150–800 ms (target < 500 ms p95).

**Freq:** High during live auctions (10–200/min per hot item).

**Return immediately:** **Yes** — frontend waits for success/failure.

**SQS:** Optional for outbid notification + WebSocket fan-out; bid persistence stays **sync**.

---

## Categories — **READY**

| Endpoint | Method | Auth | Role |
|----------|--------|------|------|
| `GET /api/v1/categories` | GET | No* | *Router has `Depends(security)` but list may still require token — verify frontend |
| `GET /api/v1/categories/{id}` | GET | No* | |
| `POST /api/v1/categories` | POST | Yes | ADMIN |
| `PATCH /api/v1/categories/{id}` | PATCH | Yes | ADMIN |
| `DELETE /api/v1/categories/{id}` | DELETE | Yes | ADMIN |

Tables: `categories`.

---

## Administrator — **READY**

| Operation | Endpoint | Method |
|-----------|----------|--------|
| List users | `GET /api/v1/admin/users` | GET |
| Update user status | `PATCH /api/v1/admin/users/{id}/status` | PATCH |
| Create admin user | `POST /api/v1/admin/users` | POST |
| List admin sessions | `GET /api/v1/admin/auction-sessions` | GET |
| List pending sessions | `GET /api/v1/admin/auction-sessions/pending` | GET |

CLI bootstrap: `python -m app.commands.create_admin` with `INITIAL_ADMIN_*` env vars.

---

## Notifications — **READY** (read); **NEEDS REFACTORING** (create path)

| Endpoint | Method | Auth |
|----------|--------|------|
| `GET /api/v1/notifications` | GET | Yes |
| `PATCH /api/v1/notifications/{id}/read` | PATCH | Yes |
| `PATCH /api/v1/notifications/read-all` | PATCH | Yes |

Creation today is **internal** (`notify_outbid`, session approve/reject/cancel) — not a public POST.

**Lambda recommendation:** Keep DB notification insert; optionally duplicate to SQS for email/push. **MISSING:** winner, auction-ended, payment notifications.

---

## Health — **READY**

| Endpoint | Method |
|----------|--------|
| `GET /health` | GET |

Use for API Gateway health checks (no DB check today — **DECISION REQUIRED** whether to add deep health).

---

# Lambda Deployment Structure

## Option A: One FastAPI Lambda

**Pros:** Minimal code change, Mangum wrapper, same DI.  
**Cons:** WebSocket still broken at scale; large cold start; all HTTP in one blast radius.

## Option B: Multiple domain Lambdas

**Pros:** Independent scaling, smaller packages.  
**Cons:** Duplicate auth/DB boilerplate; harder local dev; many API Gateway integrations.

## Option C: Hybrid — **RECOMMENDED**

```text
auction-http-api (Mangum + FastAPI)     → all REST endpoints
auction-ws-connect                      → $connect
auction-ws-disconnect                   → $disconnect
auction-ws-message                      → join, chat, ping, default
auction-scheduler                       → EventBridge cron
auction-notification-worker             → SQS consumer
auction-image-processor                 → S3 event
```

| Reason | Explanation |
|--------|-------------|
| Reuse | ~90% of Python code stays in shared package imported by HTTP Lambda |
| WebSocket | API Gateway WebSocket requires separate route handlers + DynamoDB |
| Scheduler | Must not depend on HTTP GET traffic to end auctions |
| Isolation | Image processing (Pillow) and email should not inflate bid Lambda cold start |

**Tag:** **DECISION REQUIRED** — team should confirm Option C before build.

---

# API Gateway HTTP Requirements

| Item | Recommendation | Tag |
|------|----------------|-----|
| API type | **HTTP API** (lower cost, lower latency than REST API) | **DECISION REQUIRED** |
| Routes | `$default` → `ANY /{proxy+}` → `auction-http-api` Lambda OR explicit route map mirroring `/api/v1/*` | **READY** to proxy all |
| JWT | **Phase 1:** Keep FastAPI JWT validation (Bearer header) — **READY** | |
| JWT Phase 2 | Optional API Gateway JWT authorizer (same `JWT_SECRET_KEY` or Cognito) | **DECISION REQUIRED** |
| CORS | Match `CORS_ORIGINS` / frontend origin; configure on HTTP API + keep FastAPI middleware | **READY** |
| Request size | 10 MB default HTTP API; image uploads should **not** use HTTP body — use S3 presigned | **NEEDS REFACTORING** |
| Response size | 10 MB; bid/session JSON well under limit | **READY** |
| Timeout | API Gateway max **30 s**; Lambda max 15 min — set Lambda to 30 s for HTTP, lower for bid (10 s) | **RISK** |
| Custom domain | Recommended for production (`api.example.com`) | **DECISION REQUIRED** |
| HTTPS | Required (API Gateway default) | **READY** |
| Stages | `dev`, `staging`, `prod` | **DECISION REQUIRED** |

## Should every request go to one FastAPI Lambda?

**Yes for Phase 1 HTTP migration** — single Mangum handler simplifies migration.

**No long-term for:** WebSocket (separate), scheduler, S3, SQS workers.

## Frontend API URL

```env
VITE_API_BASE_URL=https://api.example.com/api/v1
VITE_WS_BASE_URL=wss://ws.example.com
```

Build-time or runtime config per stage. See `frontend/src/services/axiosClient.ts`, `auctionItemSocketClient.ts`.

---

# FastAPI Lambda Adapter

## Mangum — **NEEDS REFACTORING** (not in repo today)

**Proposed handler** (`backend/lambda_handler.py` — **MISSING** file):

```python
from mangum import Mangum

from app.main import app

handler = Mangum(app, lifespan="off")
```

| Topic | Guidance | Tag |
|-------|----------|-----|
| Import path | `app.main:app` | **READY** |
| Event conversion | Mangum maps API Gateway v2 ↔ ASGI | **READY** (add dependency) |
| Lifespan | Use `lifespan="off"` or remove `create_all` / `engine.dispose` from lifespan | **NEEDS REFACTORING** |
| Cold start | FastAPI + SQLAlchemy + asyncmy ≈ 1–3 s without VPC; +1–3 s with VPC | **RISK** |
| Static `/uploads` | Remove from Lambda app; serve via CloudFront + S3 | **NEEDS REFACTORING** |

Add `mangum` to deployment requirements (**MISSING** from `requirements.txt`).

---

# Database Requirements

| Item | Current | Lambda target |
|------|---------|---------------|
| MySQL version | 8.0 (Docker) | **RDS MySQL 8.0** |
| Database name | `auction_db` (`.env.example`) | Same |
| SQLAlchemy | 2.0.51 | Same |
| Driver | asyncmy | Same (verify Lambda container compatibility) |
| Session | `get_db()` per request | Same pattern |
| Pool | Default pool on global engine | **NEEDS REFACTORING** → `poolclass=NullPool` or pool_size=1 + **RDS Proxy** |
| Transactions | Explicit commit/rollback in services | **READY** |
| Row locking | `with_for_update()` on item + session | **READY** — works on RDS |

## Connection architecture — **RECOMMENDED**

```text
Lambda (auction-http-api, scheduler, etc.)
        ↓ TCP 3306
RDS Proxy
        ↓
RDS MySQL (private subnet)
```

### Why RDS Proxy — **RISK** if skipped

- Lambda concurrency N can open N×pool connections → exhaust MySQL `max_connections`
- Proxy multiplexes many Lambda clients onto fewer DB connections
- Handles stale connection recycling with `pool_pre_ping=True`

### Warm container engine reuse — **NEEDS REFACTORING**

- **Do** create module-level `engine` once per execution environment
- **Do not** call `engine.dispose()` on every invocation
- **Do** open/close `AsyncSession` per request/job
- Remove lifespan `create_all` — use Alembic migrations only (**READY** migrations exist)

### Max concurrency estimate

| Metric | Estimate |
|--------|----------|
| HTTP requests/min (peak) | 500–2,000 |
| Concurrent bid invocations (hot item) | 5–50 |
| DB connections without proxy | **RISK** — could exceed 100+ |
| With RDS Proxy | Target < 50 backend connections |

---

# VPC Requirements

**No AWS VPC exists in repo today** — all values below are **DECISION REQUIRED** / planned.

| Item | Example placeholder |
|------|----------------------|
| Region | `ap-southeast-1` (choose nearest to users) |
| VPC CIDR | `10.0.0.0/16` |
| Private subnets | `private-a`, `private-b` (2+ AZ) |
| Lambda SG | Outbound 3306 → RDS Proxy SG |
| RDS Proxy SG | Inbound 3306 from Lambda SG; outbound 3306 → RDS SG |
| RDS SG | Inbound 3306 from RDS Proxy SG only |
| NAT Gateway | Required if Lambda needs public SMTP without VPC endpoints |
| VPC endpoints | Optional: `secretsmanager`, `sqs`, `dynamodb`, `s3` to reduce NAT cost |

## Lambda must access

| Service | Required | Via |
|---------|----------|-----|
| RDS (via Proxy) | Yes | VPC private |
| Secrets Manager | Yes | VPC endpoint or NAT |
| S3 | Yes (images) | Gateway endpoint or NAT |
| DynamoDB | Yes (WebSocket) | VPC endpoint (recommended) |
| SQS | Yes (async) | VPC endpoint or NAT |
| CloudWatch Logs | Yes | AWS managed |
| API Gateway Management API | Yes (WebSocket broadcast) | NAT or public endpoint |
| SMTP (external) | Optional | NAT |

```text
Lambda SG → :3306 → RDS Proxy SG → :3306 → RDS SG
```

---

# Authentication Requirements

| Item | Implementation | Tag |
|------|----------------|-----|
| JWT creation | `create_access_token()` — `app/core/security.py` | **READY** |
| JWT validation | `decode_access_token()` + FastAPI Depends | **READY** |
| Algorithm | `HS256` (`JWT_ALGORITHM`) | **READY** |
| Expiration | `ACCESS_TOKEN_EXPIRE_MINUTES` (default 30) | **READY** |
| Roles | `ADMIN`, `USER` | **READY** |
| Status | `ACTIVE`, `BANNED` — checked on login and protected routes | **READY** |
| Password hash | bcrypt via `hash_password` / `verify_password` | **READY** |

## First migration decision

**Keep existing FastAPI JWT unchanged** for Phase 1–3. API Gateway passes `Authorization` header through to Lambda; Mangum preserves headers.

Cognito migration: **DECISION REQUIRED** for later; not required for initial Lambda cutover.

WebSocket auth today: optional `?token=` query param — `resolve_websocket_user()` in `websocket_auth.py`. Replicate in `$connect` route for API Gateway WebSocket.

---

# Bid Placement Requirements

**Current implementation:** `BidService.place_bid()` — **READY** core logic.

| Step | Behavior | Tag |
|------|----------|-----|
| Lock item | `AuctionItemRepository.find_by_id_for_update()` | **READY** |
| Item status | Must be `UNSOLD` | **READY** |
| Session status | Must be `ACTIVE` | **READY** |
| Seller check | Session seller cannot bid | **READY** |
| Min increment | From `auction_session_rules.min_increment` | **READY** |
| Previous winner | Set to `OUTBID` | **READY** |
| New bid | Insert `WINNING` | **READY** |
| Price | Update `auction_items.current_price` | **READY** |
| Notification | `notify_outbid()` same transaction | **READY** |
| Commit | Then WebSocket `BID_PLACED` publish | **NEEDS REFACTORING** for API GW Management API |
| Rollback | On `AppException` or generic error | **READY** |

## Lambda safety

| Question | Answer |
|----------|--------|
| Safe on Lambda? | **Yes**, if using RDS row locks — not in-memory locks |
| Process memory dependency? | **No** for bid persistence; **Yes** today for WebSocket publish (in-memory registry) |
| Two simultaneous bids? | Serialized by InnoDB row lock on `auction_items.id` |
| Idempotency key? | **MISSING** — recommend `Idempotency-Key` header + DynamoDB or DB table |
| Duplicate API retries? | **RISK** — client retry could double-bid without idempotency |

**Do not** use in-memory locks as primary concurrency control. Current `asyncio.Lock` in connection registry is **only** for WebSocket, not bids.

---

# Scheduled Auction Requirements

## Current state — **NEEDS REFACTORING**

| Feature | Today | Tag |
|---------|-------|-----|
| Auto end sessions | `AuctionSessionRepository.synchronize_time_based_statuses()` on **read** paths | **RISK** |
| Auto start sessions | Same — SCHEDULED → ACTIVE by time | **RISK** |
| Finalize items | `_finalize_ended_items()` — winner selection | **READY** logic, wrong trigger |
| HTTP end session | **MISSING** | |
| Payment expiry | **MISSING** (no payments table) | |

## First scheduled feature — **RECOMMENDED**

**Auction scheduler Lambda** every **1 minute** via EventBridge:

```text
EventBridge rate(1 minute)
        ↓
auction-scheduler Lambda
        ↓
1. End sessions: status IN (SCHEDULED, ACTIVE) AND end_time <= NOW → ENDED
2. Activate sessions: SCHEDULED AND start_time <= NOW < end_time → ACTIVE
3. Finalize items on ENDED sessions (existing _finalize_ended_items logic)
4. Optional: enqueue notification SQS messages
```

| Item | Value |
|------|-------|
| Frequency | 1 minute — **sufficient for v1** (sub-minute precision not required) |
| Per-invocation batch | Process up to 100 sessions per run (**DECISION REQUIRED**) |
| Locking | `find_by_id_for_update` per session during finalize | **NEEDS REFACTORING** |
| Idempotency | Status conditional updates (`WHERE status = 'ACTIVE'`) | **NEEDS REFACTORING** |
| DLQ | SQS DLQ or Lambda DLQ on scheduler | **MISSING** |
| Retry | EventBridge retry 2x, then DLQ | **DECISION REQUIRED** |

**Per-auction EventBridge schedule:** defer to v2 (complexity vs benefit).

**MISSING features:** expire unpaid orders, clean expired data (no payments).

---

# WebSocket Requirements

## Current — **NEEDS REFACTORING**

| Component | File |
|-----------|------|
| Route | `app/presentation/websocket/auction_item_websocket_router.py` |
| Registry | `InMemoryAuctionConnectionRegistry` |
| Join | `JoinAuctionItemUseCase` |
| Leave | `LeaveAuctionItemUseCase` |
| Chat | `SendAuctionChatMessageUseCase` |
| Events | `app/domain/events/*` |

In-memory structures: `_rooms`, `_participants`, `_session_index`, `asyncio.Lock`.

**Cannot move to Lambda HTTP ASGI as-is.**

## Target architecture

```text
Browser → API Gateway WebSocket API
              ↓
    $connect / $disconnect / custom routes
              ↓
    WebSocket Lambdas
              ↓
    DynamoDB (connections + room membership)
              ↓
    apigatewaymanagementapi.post_to_connection (broadcast)
```

### Proposed routes

| Route | Handler responsibility |
|-------|------------------------|
| `$connect` | Auth (JWT from query), store connectionId |
| `$disconnect` | Remove connection, update viewer count, broadcast leave |
| `joinAuctionItem` | Associate connection with `itemId`, snapshot, viewer count |
| `sendChatMessage` | Validate user + content, broadcast |
| `ping` | Pong |
| `$default` | Unknown types |

### DynamoDB design — **MISSING**

**Table: `auction-ws-connections`**

| Key | Type | Purpose |
|-----|------|---------|
| PK: `itemId` | String (UUID) | Partition by auction item room |
| SK: `connectionId` | String | API Gateway connection ID |
| GSI1 PK: `connectionId` | | Lookup on disconnect |
| Attributes | `userId`, `displayName`, `clientSessionId`, `connectedAt`, `ttl` | |

**Viewer count:** `Query` PK=`itemId` → Count (or maintain atomic counter — **DECISION REQUIRED**).

**Chat history:** **MISSING** today (ephemeral). **DECISION REQUIRED:** DynamoDB TTL table vs RDS vs none.

**Stale connections:** TTL + failed `post_to_connection` → delete record.

---

# Viewer Tracking Requirements

| Scenario | Current | Lambda target |
|----------|---------|---------------|
| First viewer | In-memory connect | DynamoDB put + broadcast |
| Second viewer | Same | Count + `VIEWER_JOINED` |
| Different item | Separate room key | PK = itemId |
| Refresh | `clientSessionId` reconnect dedupe | **READY** logic in join use case — port to DynamoDB |
| Close tab | `$disconnect` | Remove + broadcast |
| Network loss | API Gateway disconnect event | Same |
| Reconnect | Dedupe via `sessionId` query param | **READY** |
| Stale connection | **RISK** in memory | TTL + failed send cleanup |
| Broadcast fail | Logged | Delete stale connectionId |

---

# Chat Requirements

| Rule | Current | Tag |
|------|---------|-----|
| Send auth | Required (`SendAuctionChatMessageUseCase`) | **READY** |
| Read | Guests can connect without token | **READY** |
| Max length | 500 chars | **READY** |
| Storage | Not persisted | **MISSING** |
| Moderation | None | **MISSING** |
| Rate limit | None | **MISSING** — add API GW or Lambda throttle |
| Duplicate prevention | None | **MISSING** |

Flow: WebSocket route → chat Lambda → validate → optional store → `post_to_connection` to room.

---

# Image Upload Requirements

## Current — **NEEDS REFACTORING**

| Item | Current |
|------|---------|
| Upload | `POST /api/v1/auction-items/{id}/images` multipart |
| Storage | `LocalStorageService` → `/uploads/` |
| Max size | `MAX_UPLOAD_SIZE_MB` (default 5) |
| Formats | JPEG, PNG, WEBP |
| Max count | 5 per item |
| Processing | **MISSING** (no resize/thumbnail) |
| S3 | Stub `S3StorageService` raises `NotImplementedError` |

## Target flow

```text
1. POST /api/v1/auction-items/{id}/images/presign → HTTP Lambda → presigned PUT URL
2. Frontend uploads to S3 directly
3. S3 ObjectCreated → auction-image-processor Lambda
4. Validate, resize, thumbnail (Pillow — **MISSING**)
5. Update item_images.image_url in RDS
```

| Item | Placeholder |
|------|-------------|
| Bucket | `IMAGE_BUCKET_NAME` |
| Max size | 5 MB (**READY** config) |
| Thumbnail | 400×400 (**DECISION REQUIRED**) |
| Virus scan | **MISSING** — optional ClamAV Lambda |

---

# Notification Requirements

## Implemented today — **READY** (partial)

| Type | Channel | Trigger |
|------|---------|---------|
| Outbid | DB `notifications` | `place_bid` |
| Session approved/rejected/cancelled | DB | Admin session actions |

## Missing — **MISSING**

Winner, auction ended, payment, push, email (except password reset BackgroundTasks).

## Recommended async flow

```text
Producer (bid, scheduler, session service)
        ↓
SQS notification-queue
        ↓
auction-notification-worker Lambda
        ↓
INSERT notifications + optional SES email + WebSocket push via Management API
```

| Channel | v1 | v2 |
|---------|----|----|
| DB record | Yes | Yes |
| WebSocket | Via Management API | Yes |
| Email (SES) | Optional | Yes |
| SNS push | No | **DECISION REQUIRED** |

Duplicate prevention: idempotency key per `(userId, type, itemId, eventId)`.

---

# SQS Requirements

| Queue | Producer | Consumer | Async? | Tag |
|-------|----------|----------|--------|-----|
| `auction-notifications` | Bid, scheduler, session | notification-worker | Yes | **MISSING** |
| `auction-email` | Forgot password, notifications | email-worker | Yes | **MISSING** |
| `auction-image-processing` | Optional alternative to S3 event | image-processor | Yes | **DECISION REQUIRED** |

Per queue: visibility timeout ≥ Lambda timeout; DLQ after 3 receives; retention 14 days; JSON schema with `eventType`, `payload`, `idempotencyKey`.

---

# EventBridge Requirements

| Rule | Schedule | Target | Tag |
|------|----------|--------|-----|
| `auction-scheduler-tick` | `rate(1 minute)` | `auction-scheduler` | **MISSING** |
| `auction-cleanup` | `rate(1 day)` | cleanup Lambda | **MISSING** (no data to clean yet) |

Input: `{}` or `{"source":"eventbridge","tick":true}`.

Retry: 2 retries, DLQ on failure.

**v1:** Recurring scan every minute is **sufficient**.

---

# DynamoDB Requirements

| Table | Purpose | Tag |
|-------|---------|-----|
| `auction-ws-connections` | WebSocket connection registry | **MISSING** |
| `auction-idempotency` | Bid/request dedupe (optional) | **MISSING** |
| `auction-processed-events` | Scheduler dedupe | **MISSING** |

Capacity: **On-demand** for v1 (unknown WebSocket load).

TTL: `expiresAt` on connection records (e.g. 24h).

---

# Lambda Execution Requirements

| Function | Trigger | Runtime | Memory | Timeout | VPC | Concurrency |
|----------|---------|---------|--------|---------|-----|-------------|
| `auction-http-api` | HTTP API | Python 3.11 | 1024 MB | 30 s | Yes | Reserved: **DECISION REQUIRED** |
| `auction-ws-connect` | WS $connect | Python 3.11 | 256 MB | 10 s | Yes | — |
| `auction-ws-disconnect` | WS $disconnect | Python 3.11 | 256 MB | 10 s | Yes | — |
| `auction-ws-message` | WS routes | Python 3.11 | 512 MB | 10 s | Yes | — |
| `auction-scheduler` | EventBridge | Python 3.11 | 512 MB | 60 s | Yes | Reserved concurrency = 1 |
| `auction-notification-worker` | SQS | Python 3.11 | 512 MB | 30 s | Yes | — |
| `auction-image-processor` | S3 event | Python 3.11 | 1024 MB | 60 s | Yes | — |

Architecture: **arm64** (Graviton) — **DECISION REQUIRED** (verify asyncmy wheels).

Provisioned concurrency: consider **5–10** for `auction-http-api` on bid-heavy endpoints — **DECISION REQUIRED**.

Logging: structured JSON to CloudWatch; include `requestId`, `userId`, `itemId`.

---

# Packaging Requirements

| Method | Recommendation | Tag |
|--------|----------------|-----|
| HTTP Lambda | **Container image** (existing Docker familiarity, asyncmy, bcrypt) | **DECISION REQUIRED** |
| WebSocket Lambdas | ZIP or shared container layer | **NEEDS REFACTORING** |
| Pillow | Image Lambda only | **MISSING** dependency |

| Item | Value |
|------|-------|
| Handler (HTTP) | `lambda_handler.handler` |
| Dependencies | `requirements.txt` + `mangum` |
| Package size | Container avoids 250 MB ZIP limit |
| Linux | Lambda container base or `public.ecr.aws/lambda/python:3.11` |

---

# Environment Variables and Secrets

See `docs/environment-variables.md`. Lambda additions:

| Variable | Store | Sensitive |
|----------|-------|-----------|
| `DATABASE_URL` | Secrets Manager | Yes |
| `JWT_SECRET_KEY` | Secrets Manager | Yes |
| `WEBSOCKET_API_ENDPOINT` | Parameter Store | No |
| `WEBSOCKET_CONNECTIONS_TABLE` | Parameter Store | No |
| `NOTIFICATION_QUEUE_URL` | Parameter Store | No |
| `IMAGE_BUCKET_NAME` | Parameter Store | No |
| `ENVIRONMENT` | Env | No |
| `LOG_LEVEL` | Env | No |

Never commit real secrets. Placeholder: `JWT_SECRET_KEY=<secret>`.

---

# IAM Requirements

| Function | Minimum permissions |
|----------|----------------------|
| `auction-http-api` | `logs:*`; `secretsmanager:GetSecretValue`; RDS Proxy via VPC; `s3:PutObject` (presign only) |
| WebSocket Lambdas | `dynamodb:*` on connections table; `execute-api:ManageConnections` |
| `auction-scheduler` | Same DB secrets; optional `sqs:SendMessage` |
| `auction-notification-worker` | `sqs:ReceiveMessage`; DB; `ses:SendEmail` |
| `auction-image-processor` | `s3:GetObject`, `s3:PutObject`; DB update |

**No `AdministratorAccess`.**

---

# Expected Frequency (estimates)

| Metric | Estimate |
|--------|----------|
| HTTP req/min (peak) | 200–1,000 |
| Login/day | 100–1,000 |
| Bids/min (peak, all items) | 50–500 |
| Concurrent bids (single hot item) | 5–30 |
| WebSocket connections (peak) | 100–2,000 |
| WS messages/min | 50–500 |
| Sessions processed/min (scheduler) | 1–20 |
| Images uploaded/day | 10–200 |
| Notifications/day | 500–5,000 |

---

# Expected Workload (estimates)

| Metric | Estimate |
|--------|----------|
| Active sessions | 5–50 |
| Items per session | 10–100 |
| Bids per item | 0–500 |
| Concurrent users | 50–1,000 |
| WS connections | 100–2,000 |
| Chat messages per item | 0–1,000 (if stored later) |
| Max image size | 5 MB |
| Max images per item | 5 |
| DB query p95 | < 100 ms |

---

# User Experience

| Operation | UX | Tag |
|-----------|-----|-----|
| Place bid | Wait for success/failure | **READY** |
| Login/register | Wait | **READY** |
| Upload image | Presign immediately; processing async | **NEEDS REFACTORING** |
| Auction closes | WS event when scheduler completes | **MISSING** WS + scheduler |
| Email | Do not wait | **NEEDS REFACTORING** |
| List/detail | Wait | **READY** |

---

# Failure Behavior

| Function | On failure | Retry | Idempotent? |
|----------|------------|-------|-------------|
| HTTP bid | 4xx/5xx to client | Client may retry — **RISK** | **NEEDS** idempotency key |
| Scheduler | EventBridge retry | 2x | Mostly yes with status checks |
| WS broadcast | Log + delete stale connection | No | Yes |
| Image processor | S3 retry / DLQ | 3x | Overwrite S3 keys |
| Notification worker | SQS visibility timeout | 3x then DLQ | Dedupe key |

One failed auction must **not** block others — process per session in loop with try/except.

---

# Retry, Idempotency, Logging

See sections above. Key **MISSING** items:

- Bid idempotency key
- Scheduler processed-event table
- DLQ alarms

**Logging:** CloudWatch log groups per function; redact `JWT`, passwords, SMTP creds.

**Alarms:** Lambda errors, throttles, duration > 5s (bid), API GW 5xx, DLQ depth, RDS connection failures.

---

# Cold Start Requirements

| Endpoint | Latency sensitivity |
|----------|---------------------|
| Place bid | **Highest** — target p95 < 800 ms total |
| Login | Medium |
| List sessions | Lower |

VPC cold start: **RISK** (+1–3 s). Mitigation: provisioned concurrency on HTTP Lambda; RDS Proxy; slim imports.

Lifespan `create_all` must be removed — adds DB work on cold start.

---

# Security Requirements

| Control | Status |
|---------|--------|
| HTTPS | API Gateway — **READY** |
| JWT | FastAPI — **READY** |
| CORS | **READY** |
| SQL injection | SQLAlchemy ORM — **READY** |
| Input validation | Pydantic — **READY** |
| S3 private + presigned TTL | **MISSING** |
| Rate limiting | **MISSING** — API GW throttling |
| Chat abuse | **MISSING** |
| Bid abuse | **MISSING** — beyond row locks |

---

# Cost Requirements

Always-on cost drivers after migration:

| Resource | Notes |
|----------|-------|
| RDS MySQL | Largest fixed cost |
| RDS Proxy | Additional hourly |
| NAT Gateway | **RISK** — high if all traffic via NAT |
| API Gateway WebSocket | Per connection-minute |
| DynamoDB on-demand | Scales with WS |
| CloudWatch Logs | Retention cost |
| Lambda | Usually smaller than RDS+NAT |

Lambda itself is often **not** the main bill — **RDS + NAT + WebSocket** are.

---

# Migration Requirements

| Phase | Scope | Reused files | New AWS resources | Frontend changes |
|-------|-------|--------------|-------------------|------------------|
| **1** | Prepare FastAPI for Lambda | Most of `backend/` | — | None |
| **2** | HTTP API + Mangum | `app/main.py` refactor, `lambda_handler.py` | HTTP API, Lambda, IAM | `VITE_API_BASE_URL` |
| **3** | Deploy HTTP Lambda | Routers, services | Lambda container | Point to API GW |
| **4** | RDS Proxy | `database.py` pool config | RDS, Proxy, VPC | None |
| **5** | Test auth + CRUD | Auth, users, categories | — | Regression test |
| **6** | Test bid concurrency | `BidService`, item lock | Load test | Bid UX |
| **7** | Scheduler Lambda | Port `synchronize_time_based_statuses` | EventBridge rule | Optional WS “ended” |
| **8** | Replace WebSocket | Domain events, use cases | WS API, DynamoDB, 3 Lambdas | `VITE_WS_BASE_URL` wss |
| **9** | Viewer tracking | Join/leave use cases | DynamoDB | None |
| **10** | Chat | `SendAuctionChatMessageUseCase` | WS route | None |
| **11** | S3 images | `item_service`, storage | S3, image Lambda | Presign upload flow |
| **12** | SQS notifications | `NotificationService` | SQS, worker Lambda | None |
| **13** | Remove EC2 | — | Decommission Docker host | None |

Rollback: keep EC2 on previous URL until DNS cutover validated; blue/green API Gateway stages.

---

# Deployment Preference

| Tool | Recommendation |
|------|----------------|
| **AWS SAM** | **Recommended for v1** — native Lambda + API GW + EventBridge; good for Python; simpler than Terraform for small team |
| **Terraform** | Better for multi-env infra + RDS + VPC as code at scale |
| Console | Dev only |
| GitHub Actions | CI/CD deploy SAM/Terraform |

Compare: SAM faster to first Lambda; Terraform better for full org standards — **DECISION REQUIRED**.

---

# Development Environment

| Item | Current |
|------|---------|
| OS | Windows 10/11 (user env) |
| Python | 3.11 (Dockerfile) |
| Docker Desktop | Used for Compose |
| Local MySQL | Docker port 3307 |
| Local frontend | Vite port 5173 |
| Local WebSocket | `ws://localhost:8000/ws/auction-items/{id}` |
| Local Lambda test | **MISSING** — add SAM local invoke |

---

# Final Recommendation

Based on the **actual** Live-Auction codebase:

| # | Recommendation | Tag |
|---|----------------|-----|
| 1 | **Move complete backend to Lambda** — yes, as target architecture | **DECISION REQUIRED** |
| 2 | **Option C Hybrid** — one FastAPI HTTP Lambda + separate WS/scheduler/worker Lambdas | **RECOMMENDED** |
| 3 | **Keep in FastAPI Lambda:** all REST routers, services, repositories, JWT auth, bid placement | **READY** |
| 4 | **Separate Lambdas:** WebSocket, scheduler, image processing, SQS notification worker | **NEEDS REFACTORING** |
| 5 | **RDS Proxy:** yes — required for bid concurrency + Lambda scale | **RISK** if omitted |
| 6 | **DynamoDB:** yes — required for WebSocket connection registry | **MISSING** today |
| 7 | **API Gateway WebSocket:** yes — cannot use in-memory FastAPI WS on Lambda | **NEEDS REFACTORING** |
| 8 | **SQS:** yes — for email and non-critical notifications | **MISSING** |
| 9 | **Migrate first:** HTTP API + auth + CRUD + bids (with RDS Proxy) | Phase 1–6 |
| 10 | **Migrate last:** Full WebSocket chat + viewer parity, then EC2 removal | Phase 8–13 |
| 11 | **Technical risks:** VPC cold start; bid idempotency; scheduler vs bid race; WebSocket broadcast; no payment module | **RISK** |
| 12 | **Cost risks:** RDS always-on, NAT Gateway, WebSocket connection minutes | **RISK** |
| 13 | **Refactor before migration:** Remove lifespan `create_all`; fix pool strategy; add Mangum handler; remove StaticFiles; implement scheduler; plan DynamoDB registry | **NEEDS REFACTORING** |

---

*This document reflects the codebase as of the current repository state. Update when Mangum handler, RDS, or WebSocket Lambdas are implemented.*
