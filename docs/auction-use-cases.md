# Auction Backend Use Cases

This document describes **implemented** auction-related behaviors in the Live-Auction FastAPI backend, based on actual code under `backend/`.

Each use case includes all fields requested for analysis. Features that are **not implemented** are marked explicitly.

---

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Implemented in current codebase |
| ❌ | Not implemented (no matching route/service/table) |
| ⚙️ | Internal/background behavior (no dedicated public API) |

**Sync vs async:** All handlers are `async` FastAPI endpoints or WebSocket handlers. They run synchronously within the request/WebSocket lifecycle unless noted as a candidate for background/async processing.

**AWS Lambda:** Nothing in the codebase invokes AWS Lambda today. Lambda suitability is noted as an architectural recommendation only.

---

## 1. Register User

| Field | Value |
|-------|-------|
| **Use case name** | Register User |
| **API endpoint** | `POST /api/v1/auth/register` |
| **HTTP method** | `POST` |
| **Authentication** | None |
| **Required role** | None (creates `USER` role automatically) |
| **Handler** | `register()` in `modules/auth/auth_router.py` |
| **Service** | `AuthService.register()` |

### Request data

`RegisterRequest` (`modules/auth/auth_schema.py`):

| Field | Type | Notes |
|-------|------|-------|
| `email` | `EmailStr` | Normalized to lowercase |
| `password` | `string` | 6–72 characters |
| `fullName` | `string` | 2–255 characters, not blank |
| `phone` | `string` | 9–15 digits, optional leading `+` |

### Validation rules

- Pydantic field validators on `RegisterRequest` (email, full name, phone regex).
- Service checks email uniqueness via `UserRepository.find_by_email()`.
- DB unique constraint on `users.email` → `IntegrityError` mapped to `EMAIL_ALREADY_EXISTS`.

### Database tables accessed

| Table | Operation |
|-------|-----------|
| `users` | `SELECT` (duplicate check), `INSERT` |

### Records created / updated

| Table | Action |
|-------|--------|
| `users` | **Created** — `role=USER`, `status=ACTIVE`, hashed password |

### Response data

`RegisterResponse` → `RegisterUserData`: `id`, `email`, `fullName`, `phone`, `role`, `status`

### Errors

| HTTP | Code | Condition |
|------|------|-----------|
| 400 | `EMAIL_ALREADY_EXISTS` | Email already registered |
| 422 | — | Pydantic validation failure |

### Processing model

| | |
|-|-|
| **Sync / async** | Synchronous within HTTP request |
| **AWS Lambda candidate** | Possible for post-registration email verification (not implemented) |

---

## 2. Login

| Field | Value |
|-------|-------|
| **Use case name** | Login |
| **API endpoint** | `POST /api/v1/auth/login` |
| **HTTP method** | `POST` |
| **Authentication** | None |
| **Required role** | None |
| **Handler** | `login()` in `modules/auth/auth_router.py` |
| **Service** | `AuthService.login()` |

### Request data

`LoginRequest`:

| Field | Type | Notes |
|-------|------|-------|
| `email` | `EmailStr` | |
| `password` | `string` | 6–72 characters |

### Validation rules

- Email normalized to lowercase in service.
- Password verified with `verify_password()` against `users.password_hash`.
- Banned users cannot login.

### Database tables accessed

| Table | Operation |
|-------|-----------|
| `users` | `SELECT` by email |

### Records created / updated

None.

### Response data

`LoginResponse` → `LoginData`:

- `accessToken` (JWT)
- `tokenType` (`Bearer`)
- `user`: `id`, `email`, `fullName`, `role`, `status`

JWT claims include `sub` (user id), `email`, `role` via `create_access_token()`.

### Errors

| HTTP | Code | Condition |
|------|------|-----------|
| 401 | `INVALID_CREDENTIALS` | Unknown email or wrong password |
| 403 | `USER_BANNED` | `users.status = BANNED` |
| 422 | — | Pydantic validation failure |

### Processing model

| | |
|-|-|
| **Sync / async** | Synchronous |
| **AWS Lambda candidate** | No |

---

## 3. Create Auction Session

| Field | Value |
|-------|-------|
| **Use case name** | Create Auction Session |
| **API endpoint** | `POST /api/v1/auction-sessions` |
| **HTTP method** | `POST` |
| **Authentication** | Required — Bearer JWT (`Depends(security)`) |
| **Required role** | Any authenticated user (`get_current_user_id`); typically `USER` seller |
| **Handler** | `create_auction_session()` in `modules/auction_sessions/session_router.py` |
| **Service** | `AuctionSessionService.create_session()` |

### Request data

`CreateAuctionSessionRequest` (`modules/auction_sessions/session_schema.py`):

| Field | Type | Notes |
|-------|------|-------|
| `title` | `string` | 1–255 chars |
| `description` | `string \| null` | Optional |
| `startTime` | `datetime` | Converted to Vietnam naive time |
| `endTime` | `datetime` | Converted to Vietnam naive time |
| `minIncrement` | `Decimal` | Must be `> 0` |

### Validation rules

- `startTime` must be **later than current time** (`vietnam_now_naive()`).
- `startTime` must be **before** `endTime`.
- `seller_id` taken from JWT subject (not from request body).
- Session created with `status = SCHEDULED`.
- `AuctionSessionRule` created inline with `min_increment`.

### Database tables accessed

| Table | Operation |
|-------|-----------|
| `auction_sessions` | `INSERT` |
| `auction_session_rules` | `INSERT` (via relationship cascade flush) |

### Records created / updated

| Table | Action |
|-------|--------|
| `auction_sessions` | **Created** — `seller_id`, title, description, times, `status=SCHEDULED` |
| `auction_session_rules` | **Created** — linked `session_id`, `min_increment` |

### Response data

`CreateAuctionSessionResponse` → `CreateAuctionSessionData`: session `id`, `sellerId`, `title`, `description`, `startTime`, `endTime`, `status`, `rule.minIncrement`

### Errors

| HTTP | Code | Condition |
|------|------|-----------|
| 401 | `UNAUTHORIZED` | Missing/invalid token |
| 400 | `CREATE_SESSION_FAILED` | DB integrity error |
| 422 | — | Invalid times or `minIncrement` |

### Processing model

| | |
|-|-|
| **Sync / async** | Synchronous |
| **AWS Lambda candidate** | Possible to notify admins of pending session (not implemented) |

---

## 4. Start Auction Session

| Field | Value |
|-------|-------|
| **Use case name** | Start Auction Session (manual seller/admin start) |
| **API endpoint** | `PATCH /api/v1/auction-sessions/{session_id}/start` |
| **HTTP method** | `PATCH` |
| **Authentication** | Required — Bearer JWT |
| **Required role** | `ACTIVE` user who is **session seller** OR `ADMIN` |
| **Handler** | `start_auction_session()` in `modules/auction_sessions/session_router.py` |
| **Service** | `AuctionSessionService.start_session()` |

### Request data

Path parameter: `session_id` (UUID). No request body.

### Validation rules

- Session must exist.
- Caller must be session `seller_id` **or** `UserRole.ADMIN`.
- Session `status` must be `SCHEDULED`.
- Session must have rules configured.
- Current time ≥ `start_time`.
- Current time < `end_time` (if already past end → session set to `ENDED`, then error).
- On success: `status → ACTIVE`.
- For each `UNSOLD` item: sets `opened_at` if null.
- Publishes `AUCTION_STARTED` WebSocket events per UNSOLD item (best-effort, after commit).

### Database tables accessed

| Table | Operation |
|-------|-----------|
| `auction_sessions` | `SELECT … FOR UPDATE`, `UPDATE` |
| `auction_items` | `UPDATE` (`opened_at`) |

### Records created / updated

| Table | Action |
|-------|--------|
| `auction_sessions` | **Updated** — `status=ACTIVE` |
| `auction_items` | **Updated** — `opened_at` for UNSOLD items |

WebSocket clients receive `AUCTION_STARTED` events (not persisted).

### Response data

`StartAuctionSessionResponse` → `StartAuctionSessionData`: `id`, `status`, `startedAt`

### Errors

| HTTP | Code | Condition |
|------|------|-----------|
| 401 | `UNAUTHORIZED` / token errors | Invalid auth |
| 403 | `AUCTION_SESSION_ACCESS_DENIED` | Not seller or admin |
| 404 | `AUCTION_SESSION_NOT_FOUND` | Unknown session |
| 409 | `INVALID_SESSION_STATUS` | Not `SCHEDULED` |
| 409 | `SESSION_RULES_REQUIRED` | Missing rules |
| 409 | `SESSION_NOT_STARTED_YET` | Before `start_time` |
| 409 | `SESSION_ALREADY_ENDED` | Past `end_time` |
| 409 | `START_SESSION_FAILED` | Integrity error |

### Processing model

| | |
|-|-|
| **Sync / async** | Synchronous HTTP; WebSocket publish is await-ed inline after commit |
| **AWS Lambda candidate** | Realtime publish could move to event bus (not implemented) |

---

## 5. End Auction Session

| Field | Value |
|-------|-------|
| **Use case name** | End Auction Session |
| **API endpoint** | ❌ **No dedicated endpoint** |
| **HTTP method** | — |
| **Authentication** | — |
| **Required role** | — |

### Implementation status: ⚙️ Automatic / internal only

Ending is performed by `AuctionSessionRepository.synchronize_time_based_statuses()` in `modules/auction_sessions/session_repository.py`, triggered indirectly when:

- Listing or reading auction sessions (`AuctionSessionService.list_sessions`, `get_session_detail`)
- Listing or reading auction items (`AuctionItemService.list_items`, `get_item_detail`)
- Listing my bids (`BidService.list_my_bids`)

### Behavior

When `current_time >= end_time` for sessions in `SCHEDULED` or `ACTIVE`:

1. `auction_sessions.status` → `ENDED`
2. When `start_time <= current_time < end_time` for `SCHEDULED` sessions → `ACTIVE` (auto-start)
3. Sets `auction_items.opened_at` for UNSOLD items in auto-activated sessions
4. Calls `_finalize_ended_items()` (winner selection — see §11)

### Database tables accessed

| Table | Operation |
|-------|-----------|
| `auction_sessions` | `UPDATE` |
| `auction_items` | `UPDATE` |
| `bids` | `SELECT` (during finalization) |

### Records created / updated

| Table | Action |
|-------|--------|
| `auction_sessions` | **Updated** — `SCHEDULED/ACTIVE → ENDED` or `SCHEDULED → ACTIVE` |
| `auction_items` | **Updated** — `opened_at`, and finalization fields (see §11) |

### Response data

None (side effect of other read operations).

### Errors

None surfaced as a dedicated use case.

### Processing model

| | |
|-|-|
| **Sync / async** | Runs synchronously during caller's request; **could** be moved to a scheduled job |
| **AWS Lambda candidate** | **Yes** — ideal for EventBridge/cron Lambda to call `synchronize_time_based_statuses` on a schedule instead of lazy sync on reads |

---

## 6. Approve Auction Session (Admin)

| Field | Value |
|-------|-------|
| **Use case name** | Approve Auction Session |
| **API endpoint** | `PATCH /api/v1/admin/auction-sessions/{session_id}/approve` |
| **HTTP method** | `PATCH` |
| **Authentication** | Required — Bearer JWT |
| **Required role** | `ADMIN` (`get_current_admin_user`) |
| **Handler** | `approve_auction_session()` in `modules/admin/admin_router.py` |
| **Service** | `AuctionSessionService.approve_session()` |

### Request data

Path: `session_id`. No body.

### Validation rules

- Session must be `SCHEDULED`.
- Session must have **at least one item**.
- If current time ≥ `end_time` → session set to `ENDED`, error `SESSION_APPROVAL_WINDOW_EXPIRED`.
- If current time ≥ `start_time` → session becomes `ACTIVE` and items activated.
- Creates seller notification via `NotificationService.notify_session_approved()`.
- May publish `AUCTION_STARTED` WebSocket events if session becomes `ACTIVE`.

### Database tables accessed

| Table | Operation |
|-------|-----------|
| `auction_sessions` | `SELECT FOR UPDATE`, `UPDATE` |
| `auction_items` | `UPDATE` (`opened_at`) |
| `notifications` | `INSERT` |
| `notification_preferences` | `SELECT` (outbid path N/A here) |

### Records created / updated

| Table | Action |
|-------|--------|
| `auction_sessions` | **Updated** — may stay `SCHEDULED` or become `ACTIVE` |
| `auction_items` | **Updated** — `opened_at` if activated |
| `notifications` | **Created** — approval notice to seller |

### Response data

`ApproveAuctionSessionResponse` → `ApproveAuctionSessionData`: `id`, `status`, `approvedAt`

### Errors

| HTTP | Code | Condition |
|------|------|-----------|
| 403 | `ADMIN_ACCESS_REQUIRED` | Not admin |
| 404 | `AUCTION_SESSION_NOT_FOUND` | |
| 409 | `INVALID_SESSION_STATUS` | Not `SCHEDULED` |
| 409 | `SESSION_HAS_NO_ITEMS` | Empty session |
| 409 | `SESSION_APPROVAL_WINDOW_EXPIRED` | Past end time |

### Processing model

| | |
|-|-|
| **Sync / async** | Synchronous |
| **AWS Lambda candidate** | Notification dispatch could be async (not implemented) |

---

## 7. Reject Auction Session (Admin)

| Field | Value |
|-------|-------|
| **Use case name** | Reject Auction Session |
| **API endpoint** | `PATCH /api/v1/admin/auction-sessions/{session_id}/reject` |
| **HTTP method** | `PATCH` |
| **Authentication** | Required |
| **Required role** | `ADMIN` |
| **Service** | `AuctionSessionService.reject_session()` |

### Request data

`RejectAuctionSessionRequest`: optional `reason` (max 500 chars).

### Validation rules

- Session must be `SCHEDULED`.
- `status → CANCELLED`.
- All `UNSOLD` items → `CANCELLED` (`_cancel_unsold_session_items`).
- `SOLD` items unchanged.
- Notification to seller via `notify_session_rejected()`.

### Database tables accessed

`auction_sessions`, `auction_items`, `notifications`

### Records created / updated

| Table | Action |
|-------|--------|
| `auction_sessions` | **Updated** — `CANCELLED` |
| `auction_items` | **Updated** — UNSOLD → `CANCELLED` |
| `notifications` | **Created** |

### Response data

`RejectAuctionSessionResponse` → `id`, `status`, `rejectedAt`, `reason`

### Errors

404, 409 `INVALID_SESSION_STATUS`, 403 admin required.

### Processing model

Synchronous. Lambda candidate for notifications only.

---

## 8. Cancel Auction Session (Admin)

| Field | Value |
|-------|-------|
| **Use case name** | Cancel Auction Session |
| **API endpoint** | `PATCH /api/v1/admin/auction-sessions/{session_id}/cancel` |
| **HTTP method** | `PATCH` |
| **Authentication** | Required |
| **Required role** | `ADMIN` |
| **Service** | `AuctionSessionService.cancel_session()` |

### Request data

`CancelAuctionSessionRequest`: optional `reason` (max 500 chars).

### Validation rules

- Session must be `SCHEDULED`.
- Current time must be **before** `start_time` (`SESSION_ALREADY_STARTED` otherwise).
- `status → CANCELLED`; UNSOLD items → `CANCELLED`.
- `notify_session_cancelled()` to seller.

> **Note:** There is **no seller-facing cancel endpoint** in `session_router.py`; cancel is admin-only in current code.

### Database tables accessed

`auction_sessions`, `auction_items`, `notifications`

### Records created / updated

Same pattern as reject.

### Response data

`CancelAuctionSessionResponse` → `id`, `status`, `cancelledAt`, `reason`

### Errors

404, 409 `INVALID_SESSION_STATUS`, 409 `SESSION_ALREADY_STARTED`, 403.

### Processing model

Synchronous.

---

## 9. Create Auction Item

| Field | Value |
|-------|-------|
| **Use case name** | Create Auction Item |
| **API endpoint** | `POST /api/v1/auction-sessions/{session_id}/items` |
| **HTTP method** | `POST` |
| **Authentication** | Required (router-level `Depends(security)`) |
| **Required role** | Authenticated user who owns the session (`seller_id` match) |
| **Handler** | `create_auction_item()` in `modules/auction_items/item_router.py` |
| **Service** | `AuctionItemService.create_item()` |

### Request data

`CreateAuctionItemRequest`:

| Field | Type | Notes |
|-------|------|-------|
| `categoryId` | `UUID \| null` | Optional |
| `title` | `string` | 1–255 chars |
| `description` | `string \| null` | Optional |
| `startingPrice` | `Decimal` | Must be `> 0` |

Path: `session_id`.

### Validation rules

- Session must exist.
- `session.seller_id` must equal authenticated user.
- Session must be `SCHEDULED` (`SESSION_ITEMS_LOCKED` otherwise).
- If `categoryId` provided, category must exist.
- Item created with `status=UNSOLD`, `current_price=starting_price`.

### Database tables accessed

| Table | Operation |
|-------|-----------|
| `auction_sessions` | `SELECT` |
| `categories` | `SELECT` (if category provided) |
| `auction_items` | `INSERT` |

### Records created / updated

| Table | Action |
|-------|--------|
| `auction_items` | **Created** |

### Response data

`CreateAuctionItemResponse` → `CreateAuctionItemData`: item ids, prices, `status`, etc.

### Errors

| HTTP | Code | Condition |
|------|------|-----------|
| 403 | `FORBIDDEN` | Not session owner |
| 404 | `SESSION_NOT_FOUND` / `CATEGORY_NOT_FOUND` | |
| 409 | `SESSION_ITEMS_LOCKED` | Session not `SCHEDULED` |
| 400 | `CREATE_ITEM_FAILED` | Integrity error |

### Processing model

Synchronous.

---

## 10. Upload Auction Item Image

| Field | Value |
|-------|-------|
| **Use case name** | Upload Auction Item Image |
| **API endpoint** | `POST /api/v1/auction-items/{item_id}/images` |
| **HTTP method** | `POST` |
| **Authentication** | Required |
| **Required role** | Item owner (`seller_id` match) |
| **Handler** | `upload_auction_item_image()` in `modules/auction_items/item_router.py` |
| **Service** | `AuctionItemService.upload_image()` |

### Request data

`multipart/form-data`:

| Field | Type | Notes |
|-------|------|-------|
| `file` | `UploadFile` | Required |
| `isPrimary` | `boolean` | Default `false` |

Router also rejects missing content type and files over `settings.max_upload_size_bytes`.

### Validation rules

- Content type must be `image/jpeg`, `image/png`, or `image/webp`.
- Max **5 images** per item (`MAX_IMAGES_PER_ITEM`).
- Item must exist; caller must be item seller.
- Session must be `SCHEDULED`.
- First image auto-set as primary if none exists.
- File saved via `StorageService.save()` → local disk (`/uploads/{uuid}.ext`) by default.
- **No image resizing, thumbnail generation, or Lambda processing** — raw bytes written as-is.

### Database tables accessed

| Table | Operation |
|-------|-----------|
| `auction_items` | `SELECT` (with session, images) |
| `item_images` | `INSERT`, `UPDATE` (unset primary) |

### Records created / updated

| Table | Action |
|-------|--------|
| `item_images` | **Created** — `image_url`, `is_primary`, `sort_order` |
| `item_images` | **Updated** — primary flags cleared when needed |

Filesystem: new file under `uploads/`.

### Response data

`UploadAuctionItemImageResponse` → `UploadAuctionItemImageData`: `id`, `itemId`, `imageUrl`, `isPrimary`, `sortOrder`, `createdAt`

### Errors

| HTTP | Code | Condition |
|------|------|-----------|
| 400 | `INVALID_FILE_TYPE` | Bad MIME or missing content type |
| 400 | `FILE_TOO_LARGE` | Exceeds max upload size |
| 400 | `IMAGE_LIMIT_EXCEEDED` | More than 5 images |
| 403 | `FORBIDDEN` | Not item owner |
| 404 | `ITEM_NOT_FOUND` | |
| 409 | `SESSION_ITEMS_LOCKED` | Session not `SCHEDULED` |

### Processing model

| | |
|-|-|
| **Sync / async** | Synchronous; file write uses `run_in_threadpool` |
| **AWS Lambda candidate** | **Yes** — image resize/optimize on S3 upload trigger (`S3StorageService` is stub only) |

### Image processing status

| Feature | Status |
|---------|--------|
| Upload & store | ✅ |
| Local static serving (`/uploads`) | ✅ |
| S3 storage | ❌ Stub (`S3StorageService` raises `NotImplementedError`) |
| Resize / thumbnail / watermark | ❌ Not implemented |

---

## 11. Place Bid

| Field | Value |
|-------|-------|
| **Use case name** | Place Bid |
| **API endpoint** | `POST /api/v1/auction-items/{item_id}/bids` |
| **HTTP method** | `POST` |
| **Authentication** | Required |
| **Required role** | `ACTIVE` user (`get_current_active_user`); cannot be session seller |
| **Handler** | `place_bid()` in `modules/bids/bid_router.py` |
| **Service** | `BidService.place_bid()` |

### Request data

`PlaceBidRequest`:

| Field | Type | Notes |
|-------|------|-------|
| `amount` | `Decimal` | Must be `> 0` |

Path: `item_id`.

### Validation rules

- Item must exist (row locked `FOR UPDATE`).
- Item `status` must be `UNSOLD`.
- Session must exist and `status = ACTIVE`.
- Bidder cannot be `session.seller_id`.
- Session rules must exist.
- Minimum bid:
  - No winning bid yet → `amount >= starting_price`
  - Has winning bid → `amount >= current_price + min_increment`
- Previous winning bid → `OUTBID`.
- New bid → `WINNING`.
- `auction_items.current_price` updated to bid amount.
- If previous bidder differs, `NotificationService.notify_outbid()` (respects user preference).
- After commit: `PublishBidPlacedUseCase` sends `BID_PLACED` WebSocket event (errors logged, bid still saved).

### Database tables accessed

| Table | Operation |
|-------|-----------|
| `auction_items` | `SELECT FOR UPDATE`, `UPDATE` |
| `auction_sessions` | `SELECT` (via relationship) |
| `auction_session_rules` | `SELECT` |
| `bids` | `SELECT`, `INSERT`, `UPDATE` |
| `notifications` | `INSERT` (outbid) |
| `notification_preferences` | `SELECT` |

### Records created / updated

| Table | Action |
|-------|--------|
| `bids` | **Created** — new `WINNING` bid |
| `bids` | **Updated** — prior winner → `OUTBID` |
| `auction_items` | **Updated** — `current_price` |
| `notifications` | **Created** — outbid alert (conditional) |

### Response data

`PlaceBidResponse` → `PlaceBidData`: bid `id`, `itemId`, `sessionId`, `bidderId`, `amount`, `status`, `createdAt`

### Errors

| HTTP | Code | Condition |
|------|------|-----------|
| 400 | `ITEM_NOT_BIDDABLE` | Item not `UNSOLD` |
| 400 | `AUCTION_NOT_IN_PROGRESS` | Session not `ACTIVE` |
| 400 | `BID_TOO_LOW` | Below minimum (includes `details.minimumBid`) |
| 403 | `FORBIDDEN` | Session seller bidding |
| 403 | `USER_BANNED` / `USER_NOT_ACTIVE` | Inactive bidder |
| 404 | `AUCTION_ITEM_NOT_FOUND` | |
| 409 | `AUCTION_RULE_NOT_CONFIGURED` | Missing rules |

### Processing model

| | |
|-|-|
| **Sync / async** | Synchronous; WebSocket publish after commit |
| **AWS Lambda candidate** | Outbid notifications and realtime publish could be event-driven |

---

## 12. Viewer Join (WebSocket)

| Field | Value |
|-------|-------|
| **Use case name** | Viewer Join Auction Item |
| **API endpoint** | `WS /ws/auction-items/{item_id}` |
| **HTTP method** | WebSocket upgrade |
| **Authentication** | Optional — JWT via query param `?token=` |
| **Required role** | None (guests allowed; authenticated users get `user_id` in events) |
| **Handler** | `auction_item_viewer_websocket()` in `app/presentation/websocket/auction_item_websocket_router.py` |
| **Use case** | `JoinAuctionItemUseCase.execute()` |

### Request data

| Param | Type | Notes |
|-------|------|-------|
| `item_id` | UUID | Path |
| `token` | string | Optional JWT |
| `sessionId` | string | Optional client reconnect id (dedupe join events) |

Built participant via `build_auction_realtime_participant()`.

### Validation rules

- Item must exist (`AuctionItemRepository.get_realtime_snapshot()`).
- Connection registered in `InMemoryAuctionConnectionRegistry`.
- Snapshot sent to connecting client (`AUCTION_ITEM_SNAPSHOT`).
- On new (non-reconnect) join:
  - Broadcast `VIEWER_COUNT_UPDATED`
  - If viewer count > 1, broadcast `VIEWER_JOINED` to others
- Invalid item → WebSocket closed with code `1008`.

### Database tables accessed

| Table | Operation |
|-------|-----------|
| `auction_items` | `SELECT` (snapshot query) |
| `auction_sessions` | `SELECT` (join) |
| `auction_session_rules` | `SELECT` |
| `bids` | `SELECT` (winning bid for snapshot) |

### Records created / updated

None in database. In-memory registry updated.

### Response data (WebSocket events)

- To joiner: `AUCTION_ITEM_SNAPSHOT`
- To room: `VIEWER_COUNT_UPDATED`, optionally `VIEWER_JOINED`

### Errors

- Connection rejected (close `1008`) if item invalid or snapshot send fails.
- No HTTP error envelope.

### Processing model

| | |
|-|-|
| **Sync / async** | Synchronous within WebSocket handler |
| **AWS Lambda candidate** | No — requires persistent WebSocket/API Gateway V2; registry is in-process only |

---

## 13. Viewer Leave (WebSocket)

| Field | Value |
|-------|-------|
| **Use case name** | Viewer Leave Auction Item |
| **API endpoint** | `WS /ws/auction-items/{item_id}` (disconnect) |
| **HTTP method** | WebSocket close / disconnect |
| **Authentication** | Same connection as join |
| **Required role** | None |
| **Use case** | `LeaveAuctionItemUseCase.execute()` (called in `finally` block) |

### Request data

Implicit disconnect; no payload required.

### Validation rules

- Removes connection from in-memory registry.
- If `should_publish_leave` (not a reconnect duplicate): broadcasts `VIEWER_LEFT` and `VIEWER_COUNT_UPDATED`.

### Database tables accessed

None.

### Records created / updated

None. In-memory registry updated.

### Response data

WebSocket broadcasts: `VIEWER_LEFT`, `VIEWER_COUNT_UPDATED`

### Errors

None surfaced.

### Processing model

Synchronous on disconnect. No Lambda.

---

## 14. Send Chat Message (WebSocket)

| Field | Value |
|-------|-------|
| **Use case name** | Send Auction Chat Message |
| **API endpoint** | `WS /ws/auction-items/{item_id}` (incoming JSON message) |
| **HTTP method** | WebSocket message |
| **Authentication** | Required to send (JWT via `?token=` on connect) |
| **Required role** | Any authenticated active user resolved by `resolve_websocket_user()` |
| **Use case** | `SendAuctionChatMessageUseCase.execute()` |

### Request data

WebSocket JSON:

```json
{
  "type": "SEND_CHAT_MESSAGE",
  "data": { "content": "string" }
}
```

Also supports plain-text `"ping"` and JSON `{ "type": "PING" }`.

### Validation rules

- User must be authenticated (`UNAUTHORIZED` error event if guest).
- Item must exist.
- Content trimmed; non-empty; max **500** chars (`MAX_CHAT_MESSAGE_LENGTH`).
- Publishes `CHAT_MESSAGE_SENT` to all viewers (not stored in DB).

### Database tables accessed

| Table | Operation |
|-------|-----------|
| `auction_items` | `SELECT` (exists check) |

### Records created / updated

None (chat is ephemeral / in-memory on clients only).

### Response data

Broadcast `CHAT_MESSAGE_SENT` to room. On failure, `ERROR` event to sender with codes: `UNAUTHORIZED`, `ITEM_NOT_FOUND`, `INVALID_CHAT_MESSAGE`, `MESSAGE_TOO_LONG`.

### Processing model

Synchronous. No Lambda.

---

## 15. Send Notification

There is **no standalone `POST /notifications/send` API**. Notifications are created as **side effects** of other operations and read via the notifications API.

### 15a. Create Outbid Notification (internal)

| Field | Value |
|-------|-------|
| **Trigger** | `BidService.place_bid()` when previous winning bidder is outbid |
| **Service method** | `NotificationService.notify_outbid()` |
| **API endpoint** | ⚙️ None (internal) |

**Tables:** `notifications` INSERT; reads `notification_preferences.notify_when_outbid`.

**Notification:** type `BID`, title "Bạn đã bị trả giá cao hơn", `action_url=/auction-items/{item_id}`.

---

### 15b. Create Session Approved Notification (internal)

| Field | Value |
|-------|-------|
| **Trigger** | `AuctionSessionService.approve_session()` |
| **Service method** | `NotificationService.notify_session_approved()` |

**Tables:** `notifications` INSERT (same transaction as session approve).

---

### 15c. Create Session Rejected Notification (internal)

| Field | Value |
|-------|-------|
| **Trigger** | `AuctionSessionService.reject_session()` |
| **Service method** | `NotificationService.notify_session_rejected()` |

---

### 15d. Create Session Cancelled Notification (internal)

| Field | Value |
|-------|-------|
| **Trigger** | `AuctionSessionService.cancel_session()` |
| **Service method** | `NotificationService.notify_session_cancelled()` |

---

### 15e. List Notifications

| Field | Value |
|-------|-------|
| **API endpoint** | `GET /api/v1/notifications` |
| **HTTP method** | `GET` |
| **Authentication** | Required |
| **Required role** | Any authenticated user (own notifications only) |
| **Handler** | `list_notifications()` |
| **Service** | `NotificationService.list_notifications()` |

**Query params:** `page`, `size`, `unreadOnly`.

**Tables:** `notifications` SELECT, COUNT.

**Response:** paginated `NotificationItem` list + `unreadCount`.

---

### 15f. Mark Notification Read

| Endpoint | Method | Service method |
|----------|--------|----------------|
| `PATCH /api/v1/notifications/{notification_id}/read` | `PATCH` | `mark_as_read()` |
| `PATCH /api/v1/notifications/read-all` | `PATCH` | `mark_all_as_read()` |

**Tables:** `notifications` SELECT, UPDATE.

### Notifications NOT implemented

| Notification | Status |
|--------------|--------|
| Winner / "You won" | ❌ |
| Auction ended | ❌ |
| Push/email for in-app notifications | ❌ (in-app DB only) |

### Processing model

| | |
|-|-|
| **Sync / async** | Created synchronously in caller transaction; **could** be async |
| **AWS Lambda candidate** | **Yes** — email/SMS/push fan-out from notification INSERT |

---

## 16. Winner Selection

| Field | Value |
|-------|-------|
| **Use case name** | Winner Selection / Item Finalization |
| **API endpoint** | ❌ **No dedicated endpoint** |
| **HTTP method** | — |
| **Authentication** | — |
| **Implementation** | ⚙️ `AuctionSessionRepository._finalize_ended_items()` |

### Trigger

Called from `synchronize_time_based_statuses()` when sessions are `ENDED` (see §5).

### Logic

For each `auction_items` row where session is `ENDED` and item is `UNSOLD`:

1. Find highest `bids` row with `status = WINNING` (tie-break: highest amount, earliest `created_at`).
2. Set `closed_at = current_time`.
3. **If no winning bid:**
   - Item stays `UNSOLD`
   - `winner_user_id = null`, `final_price = null`
4. **If winning bid exists:**
   - Item → `SOLD`
   - `winner_user_id = winning_bid.bidder_id`
   - `final_price = winning_bid.amount`
   - `current_price = winning_bid.amount`

### Database tables accessed

`auction_items`, `auction_sessions`, `bids`

### Records updated

`auction_items` — `status`, `winner_user_id`, `final_price`, `current_price`, `closed_at`

### Response data

None (internal).

### Side effects NOT implemented

| Feature | Status |
|---------|--------|
| `ITEM_SOLD` WebSocket event (`create_item_sold_event` exists but **never called**) | ❌ |
| Winner notification | ❌ |
| Payment collection | ❌ |

### Processing model

| | |
|-|-|
| **Sync / async** | Runs synchronously during lazy status sync; **should** be a scheduled job at scale |
| **AWS Lambda candidate** | **Yes** — finalize session on EventBridge when `end_time` reached |

---

## 17. Payment-Related Operations

| Feature | Status |
|---------|--------|
| `wallets` table | ❌ Not in codebase |
| `wallet_transactions` table | ❌ |
| `payments` table | ❌ |
| Payment API routes | ❌ |
| Wallet balance check before bid | ❌ |
| Escrow / fund lock on bid | ❌ |
| Post-auction payment capture | ❌ |

**Conclusion:** Payment and wallet flows described in product docs are **not implemented** in this backend.

### AWS Lambda

Not applicable until payment module exists.

---

## 18. Additional Implemented Auction Read Use Cases

Brief reference for completeness:

| Use case | Endpoint | Auth | Role |
|----------|----------|------|------|
| List auction sessions | `GET /api/v1/auction-sessions` | No | Public |
| List my sessions | `GET /api/v1/auction-sessions/mine` | Yes | Owner |
| Get session detail | `GET /api/v1/auction-sessions/{session_id}` | No | Public |
| List auction items | `GET /api/v1/auction-items` | No | Public |
| Get item detail | `GET /api/v1/auction-items/{item_id}` | No | Public |
| Update item | `PATCH /api/v1/auction-items/{item_id}` | Yes | Item seller |
| Delete item | `DELETE /api/v1/auction-items/{item_id}` | Yes | Item seller |
| List my bids | `GET /api/v1/bids/my` | Yes | Bidder |
| Admin list sessions | `GET /api/v1/admin/auction-sessions` | Yes | `ADMIN` |
| Admin list pending | `GET /api/v1/admin/auction-sessions/pending` | Yes | `ADMIN` |

Read endpoints trigger `synchronize_time_based_statuses()` where noted in services, which may end sessions and finalize winners as a side effect.

---

## Summary Matrix

| Use case | Endpoint | Implemented | Sync | Lambda candidate |
|----------|----------|-------------|------|------------------|
| Register | `POST /api/v1/auth/register` | ✅ | Yes | Low |
| Login | `POST /api/v1/auth/login` | ✅ | Yes | No |
| Create auction session | `POST /api/v1/auction-sessions` | ✅ | Yes | Low |
| Start auction session | `PATCH …/start` | ✅ | Yes | Medium |
| **End auction session** | — | ⚙️ Auto only | Yes (lazy) | **High** |
| Approve session | `PATCH /api/v1/admin/…/approve` | ✅ | Yes | Medium |
| Create auction item | `POST …/items` | ✅ | Yes | No |
| Upload item image | `POST …/images` | ✅ | Yes | **High** (resize) |
| Place bid | `POST …/bids` | ✅ | Yes | Medium |
| Viewer join | `WS /ws/auction-items/{id}` | ✅ | Yes | No |
| Viewer leave | WebSocket disconnect | ✅ | Yes | No |
| Send chat | WebSocket message | ✅ | Yes | No |
| Send notification | Internal + `GET/PATCH /notifications` | ✅ partial | Yes | **High** |
| **Winner selection** | — | ⚙️ Auto only | Yes (lazy) | **High** |
| **Payment / wallet** | — | ❌ | — | Future |
| **Image processing** | — | ❌ | — | **High** (when S3 added) |

---

*Generated from the Live-Auction backend codebase. Update when new routes, services, or tables are added.*
