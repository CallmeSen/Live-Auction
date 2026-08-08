# Environment Variables

Reference for every environment variable used or referenced across the Live-Auction project: backend, frontend, Docker Compose, Dockerfiles, and example `.env` files.

**Example files in repo:**

| File | Purpose |
|------|---------|
| `.env.example` (repo root) | Docker Compose — copy to `.env` at repo root |
| `backend/.env.example` | Local backend on host (MySQL still in Docker) |
| `frontend/.env.example` | Local frontend dev server |

**Security note:** Never commit real secrets. All examples below use placeholders only.

---

## How variables flow

```
.env (repo root)
    ├── docker-compose.yml  → substitutes ${VAR} for Compose + passes to containers
    ├── mysql service       → MYSQL_* (official MySQL image)
    ├── backend service     → DATABASE_URL, JWT_*, SMTP_*, STORAGE_*, etc.
    └── frontend service    → VITE_API_BASE_URL, VITE_DEV_API_PROXY, polling flags

backend/.env
    └── pydantic Settings (backend/app/core/config.py) when running backend on host

frontend/.env
    └── Vite import.meta.env when running npm run dev on host
```

Backend `Settings` loads **`backend/.env`** (`BASE_DIR / ".env"`). In Docker, variables are injected by Compose into the process environment (Pydantic reads env vars directly; the file mount is optional).

---

## Backend application (FastAPI)

Defined in `backend/app/core/config.py` (`Settings` class). Pydantic maps field names to **uppercase** environment variable names (`case_sensitive=False`).

| Variable | Application | Referenced in | Required | Example placeholder | Sensitive | Lambda needs it? |
|----------|-------------|---------------|----------|---------------------|-----------|------------------|
| `DATABASE_URL` | Backend | `app/core/config.py`, `app/core/database.py`, `app/core/session.py`, `alembic/env.py`, `app/commands/seed_db.py`, `docker-compose.yml`, `.env.example`, `backend/.env.example`, `tests/conftest.py` | **Yes** | `mysql+asyncmy://USER:PASSWORD@HOST:3306/DATABASE` | **Yes** (contains DB password) | **Yes** — any Lambda touching the database |
| `JWT_SECRET_KEY` | Backend | `app/core/config.py`, `app/core/security.py`, `docker-compose.yml`, `.env.example`, `backend/.env.example`, `tests/conftest.py` | **Yes** | `<secret>` | **Yes** | **Yes** — if Lambda validates or issues JWTs |
| `JWT_ALGORITHM` | Backend | `app/core/config.py`, `app/core/security.py`, `docker-compose.yml`, `.env.example`, `backend/.env.example` | No (default `HS256`) | `HS256` | No | Yes — if Lambda handles JWT |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Backend | `app/core/config.py`, `app/core/security.py`, `docker-compose.yml`, `.env.example`, `backend/.env.example` | No (default `30`) | `30` | No | Yes — if Lambda issues tokens |
| `CORS_ORIGINS` | Backend | `app/core/config.py`, `app/main.py` | No (built-in localhost defaults) | `http://localhost:5173,http://127.0.0.1:5173` | No | Yes — if Lambda serves HTTP API behind API Gateway |
| `SMTP_HOST` | Backend | `app/core/config.py`, `app/utils/email.py`, `docker-compose.yml`, `.env.example`, `backend/.env.example` | No (default `smtp.gmail.com`) | `smtp.example.com` | No | Yes — if Lambda sends email |
| `SMTP_PORT` | Backend | `app/core/config.py`, `app/utils/email.py`, `docker-compose.yml`, `.env.example`, `backend/.env.example` | No (default `587`) | `587` | No | Yes — if Lambda sends email |
| `SMTP_USERNAME` | Backend | `app/core/config.py`, `app/utils/email.py`, `docker-compose.yml`, `.env.example`, `backend/.env.example` | No (empty default; needed to send mail) | `noreply@example.com` | **Yes** (account identity) | Yes — if Lambda sends email |
| `SMTP_PASSWORD` | Backend | `app/core/config.py`, `app/utils/email.py`, `docker-compose.yml`, `.env.example`, `backend/.env.example` | No (empty default; needed to send mail) | `<secret>` | **Yes** | Yes — if Lambda sends email |
| `SMTP_FROM_EMAIL` | Backend | `app/core/config.py`, `app/utils/email.py`, `docker-compose.yml`, `.env.example`, `backend/.env.example` | No (falls back to `SMTP_USERNAME`) | `noreply@example.com` | No | Yes — if Lambda sends email |
| `FRONTEND_RESET_PASSWORD_URL` | Backend | `app/core/config.py`, `modules/auth/auth_service.py`, `docker-compose.yml`, `.env.example`, `backend/.env.example` | No (default `http://localhost:5173/reset-password`) | `http://localhost:5173/reset-password` | No | Yes — if Lambda sends reset emails |
| `PASSWORD_RESET_TOKEN_EXPIRE_MINUTES` | Backend | `app/core/config.py`, `app/utils/email.py`, `modules/auth/auth_service.py`, `docker-compose.yml`, `.env.example`, `backend/.env.example` | No (default `15`) | `15` | No | Yes — if Lambda handles password reset |
| `STORAGE_BACKEND` | Backend | `app/core/config.py`, `app/core/storage.py`, `docker-compose.yml`, `.env.example`, `backend/.env.example` | No (default `local`) | `local` | No | Yes — if Lambda uploads files (`s3`) |
| `UPLOAD_DIR` | Backend | `app/core/config.py`, `app/core/storage.py`, `docker-compose.yml`, `.env.example`, `backend/.env.example` | No (default `uploads`) | `uploads` | No | Only if `STORAGE_BACKEND=local` on Lambda (unusual; prefer S3) |
| `MAX_UPLOAD_SIZE_MB` | Backend | `app/core/config.py`, `modules/auction_items/item_router.py`, `docker-compose.yml`, `.env.example`, `backend/.env.example` | No (default `5`) | `5` | No | Yes — if Lambda handles uploads |
| `S3_BUCKET_NAME` | Backend | `app/core/config.py`, `app/core/storage.py` | No (empty default; required when `STORAGE_BACKEND=s3`) | `my-auction-uploads` | No | **Yes** — if Lambda uses S3 storage |
| `S3_REGION` | Backend | `app/core/config.py`, `app/core/storage.py` | No (empty default; required when `STORAGE_BACKEND=s3`) | `ap-southeast-1` | No | **Yes** — if Lambda uses S3 storage |

---

## Frontend application (Vite / React)

Vite exposes only variables prefixed with `VITE_` to client code via `import.meta.env`. Others are used at dev-server/build time only.

| Variable | Application | Referenced in | Required | Example placeholder | Sensitive | Lambda needs it? |
|----------|-------------|---------------|----------|---------------------|-----------|------------------|
| `VITE_API_BASE_URL` | Frontend | `frontend/src/services/axiosClient.ts`, `frontend/src/utils/assetUrl.ts`, `frontend/src/vite-env.d.ts`, `frontend/.env.example`, `.env.example`, `docker-compose.yml` | No (fallback `http://localhost:8000/api/v1`) | `http://localhost:8000/api/v1` | No | **No** — browser/static hosting only |
| `VITE_WS_BASE_URL` | Frontend | `frontend/src/features/auction-items/services/auctionItemSocketClient.ts`, `frontend/src/vite-env.d.ts`, `frontend/.env.example`, `.env.example` | No (fallback `ws://localhost:8000`) | `ws://localhost:8000` | No | **No** — browser only |
| `VITE_DEV_API_PROXY` | Frontend (dev server) | `frontend/vite.config.ts`, `docker-compose.yml` | No (fallback `http://localhost:8000`) | `http://backend:8000` | No | **No** — Vite dev proxy only, not used in production build |

> **Docker Compose gap:** `docker-compose.yml` passes `VITE_API_BASE_URL` to the frontend container but **not** `VITE_WS_BASE_URL`. For Docker dev, set `VITE_WS_BASE_URL` in root `.env` and add it to the frontend service `environment` block if WebSocket connections from the browser must target a specific host.

---

## Docker Compose orchestration

Used for **variable substitution** in `docker-compose.yml` and/or container naming. Not read by application Python/TS code directly (except where passed through to backend/frontend env).

| Variable | Used by | Referenced in | Required | Example placeholder | Sensitive | Lambda needs it? |
|----------|---------|---------------|----------|---------------------|-----------|------------------|
| `MYSQL_CONTAINER_NAME` | Docker Compose | `docker-compose.yml`, `.env.example` | No (Compose fails if unset) | `auction-mysql` | No | **No** |
| `MYSQL_HOST_PORT` | Docker Compose | `docker-compose.yml`, `.env.example` | Yes for Compose | `3307` | No | **No** |
| `MYSQL_CONTAINER_PORT` | Docker Compose | `docker-compose.yml`, `.env.example` | Yes for Compose | `3306` | No | **No** |
| `BACKEND_CONTAINER_NAME` | Docker Compose | `docker-compose.yml`, `.env.example` | Yes for Compose | `auction-backend` | No | **No** |
| `BACKEND_HOST_PORT` | Docker Compose | `docker-compose.yml`, `.env.example` | Yes for Compose | `8000` | No | **No** |
| `BACKEND_CONTAINER_PORT` | Docker Compose | `docker-compose.yml`, `.env.example` | Yes for Compose | `8000` | No | **No** |
| `FRONTEND_CONTAINER_NAME` | Docker Compose | `docker-compose.yml`, `.env.example` | Yes for Compose | `auction-frontend` | No | **No** |
| `FRONTEND_HOST_PORT` | Docker Compose | `docker-compose.yml`, `.env.example` | Yes for Compose | `5173` | No | **No** |
| `FRONTEND_CONTAINER_PORT` | Docker Compose | `docker-compose.yml`, `.env.example` | Yes for Compose | `5173` | No | **No** |

---

## MySQL container (official `mysql:8.0` image)

Set in `docker-compose.yml` under `services.mysql.environment`. Used only by the MySQL Docker image, not by FastAPI directly.

| Variable | Application | Referenced in | Required | Example placeholder | Sensitive | Lambda needs it? |
|----------|-------------|---------------|----------|---------------------|-----------|------------------|
| `MYSQL_ROOT_PASSWORD` | MySQL container | `docker-compose.yml`, `.env.example` | **Yes** | `<secret>` | **Yes** | **No** — use RDS credentials inside `DATABASE_URL` instead |
| `MYSQL_DATABASE` | MySQL container | `docker-compose.yml`, `.env.example` | **Yes** | `auction_db` | No | **No** |
| `MYSQL_USER` | MySQL container | `docker-compose.yml`, `.env.example` | **Yes** | `auction_user` | No | **No** |
| `MYSQL_PASSWORD` | MySQL container | `docker-compose.yml`, `.env.example` | **Yes** | `<secret>` | **Yes** | **No** — embedded in `DATABASE_URL` for app/Lambda |

---

## Frontend dev tooling (Docker)

Set in `docker-compose.yml` for file-watching inside Docker on Windows/macOS. Not application business logic.

| Variable | Application | Referenced in | Required | Example placeholder | Sensitive | Lambda needs it? |
|----------|-------------|---------------|----------|---------------------|-----------|------------------|
| `CHOKIDAR_USEPOLLING` | Node/Vite file watcher | `docker-compose.yml` | No | `true` | No | **No** |
| `WATCHPACK_POLLING` | Webpack/Vite dependency watcher | `docker-compose.yml` | No | `true` | No | **No** |

---

## CLI / scripts (not in `.env.example`)

| Variable | Application | Referenced in | Required | Example placeholder | Sensitive | Lambda needs it? |
|----------|-------------|---------------|----------|---------------------|-----------|------------------|
| `INITIAL_ADMIN_EMAIL` | `create_admin` CLI | `backend/app/commands/create_admin.py` | **Yes** (when running CLI) | `admin@example.com` | No | **No** — one-time bootstrap |
| `INITIAL_ADMIN_PASSWORD` | `create_admin` CLI | `backend/app/commands/create_admin.py` | **Yes** (when running CLI) | `<secret>` | **Yes** | **No** |
| `INITIAL_ADMIN_FULL_NAME` | `create_admin` CLI | `backend/app/commands/create_admin.py` | **Yes** (when running CLI) | `Admin User` | No | **No** |
| `INITIAL_ADMIN_PHONE` | `create_admin` CLI | `backend/app/commands/create_admin.py` | **Yes** (when running CLI) | `+84901234567` | No | **No** |

Run manually: `python -m app.commands.create_admin` (requires backend env including `DATABASE_URL` and `JWT_SECRET_KEY` via `Settings`).

---

## Test defaults (pytest only)

| Variable | Application | Referenced in | Required | Example placeholder | Sensitive | Lambda needs it? |
|----------|-------------|---------------|----------|---------------------|-----------|------------------|
| `DATABASE_URL` | pytest | `backend/tests/conftest.py` | No (setdefault if missing) | `mysql+asyncmy://USER:PASSWORD@localhost:3306/test` | **Yes** | **No** |
| `JWT_SECRET_KEY` | pytest | `backend/tests/conftest.py` | No (setdefault if missing) | `pytest-secret-key` | Low (test only) | **No** |

---

## Variables NOT in the codebase (future AWS)

These do **not** appear in any config file today but would typically be required if you enable S3 storage or deploy Lambda functions:

| Variable | Would be used for | Sensitive |
|----------|-------------------|-----------|
| `AWS_ACCESS_KEY_ID` | S3 uploads, Lambda deployment (local dev) | **Yes** |
| `AWS_SECRET_ACCESS_KEY` | S3 uploads, Lambda deployment (local dev) | **Yes** |
| `AWS_REGION` | S3 / Lambda / RDS | No |

In production AWS, prefer **IAM roles** for Lambda instead of long-lived access keys. The backend `S3StorageService` stub in `app/core/storage.py` does not read these variables yet.

---

## Quick reference by deployment mode

### Docker Compose (full stack)

Copy `.env.example` → `.env` at repo root. Minimum set:

```env
# MySQL
MYSQL_CONTAINER_NAME=auction-mysql
MYSQL_ROOT_PASSWORD=<secret>
MYSQL_DATABASE=auction_db
MYSQL_USER=auction_user
MYSQL_PASSWORD=<secret>
MYSQL_HOST_PORT=3307
MYSQL_CONTAINER_PORT=3306

# Compose / ports
BACKEND_CONTAINER_NAME=auction-backend
BACKEND_HOST_PORT=8000
BACKEND_CONTAINER_PORT=8000
FRONTEND_CONTAINER_NAME=auction-frontend
FRONTEND_HOST_PORT=5173
FRONTEND_CONTAINER_PORT=5173

# Backend (passed to backend container)
DATABASE_URL=mysql+asyncmy://USER:PASSWORD@mysql:3306/DATABASE
JWT_SECRET_KEY=<secret>
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# Frontend (browser-facing URLs — use host-accessible addresses)
VITE_API_BASE_URL=http://localhost:8000/api/v1
VITE_WS_BASE_URL=ws://localhost:8000

# Optional: uploads, SMTP, CORS
STORAGE_BACKEND=local
UPLOAD_DIR=uploads
MAX_UPLOAD_SIZE_MB=5
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USERNAME=noreply@example.com
SMTP_PASSWORD=<secret>
SMTP_FROM_EMAIL=noreply@example.com
FRONTEND_RESET_PASSWORD_URL=http://localhost:5173/reset-password
PASSWORD_RESET_TOKEN_EXPIRE_MINUTES=15
```

### Local backend on host + MySQL in Docker

Copy `backend/.env.example` → `backend/.env`:

```env
DATABASE_URL=mysql+asyncmy://USER:PASSWORD@localhost:3307/DATABASE
JWT_SECRET_KEY=<secret>
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
STORAGE_BACKEND=local
UPLOAD_DIR=uploads
MAX_UPLOAD_SIZE_MB=5
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USERNAME=noreply@example.com
SMTP_PASSWORD=<secret>
SMTP_FROM_EMAIL=noreply@example.com
FRONTEND_RESET_PASSWORD_URL=http://localhost:5173/reset-password
PASSWORD_RESET_TOKEN_EXPIRE_MINUTES=15
```

### Local frontend on host

Copy `frontend/.env.example` → `frontend/.env`:

```env
VITE_API_BASE_URL=http://localhost:8000/api/v1
VITE_WS_BASE_URL=ws://localhost:8000
```

Optional for Vite proxy override: `VITE_DEV_API_PROXY=http://localhost:8000`

---

## Dockerfiles

Neither Dockerfile declares `ENV` instructions. All runtime configuration comes from:

| Dockerfile | Config source |
|------------|---------------|
| `backend/Dockerfile` | Compose `environment`, or host env / `backend/.env` |
| `frontend/Dockerfile` | Compose `environment`, or `frontend/.env` at dev time |

Backend entrypoint `docker-entrypoint.sh` runs `python -m app.commands.seed_db` before the main command; seeding uses `DATABASE_URL` from `Settings`.

---

## Sensitive variables summary

| Variable | Why sensitive |
|----------|---------------|
| `DATABASE_URL` | Contains database password |
| `JWT_SECRET_KEY` | Forges authentication tokens if leaked |
| `MYSQL_ROOT_PASSWORD` | Full database admin access |
| `MYSQL_PASSWORD` | Application database access |
| `SMTP_PASSWORD` | Email account credentials |
| `SMTP_USERNAME` | Often an email login (treat as sensitive) |
| `INITIAL_ADMIN_PASSWORD` | Bootstrap admin credentials |

Store these in secrets managers (AWS Secrets Manager, SSM Parameter Store) for production — not in git.

---

## AWS Lambda: typical subset

If you extract backend logic into Lambda functions:

| Lambda function type | Variables typically required |
|---------------------|------------------------------|
| HTTP API (FastAPI adapter) | `DATABASE_URL`, `JWT_SECRET_KEY`, `JWT_ALGORITHM`, `CORS_ORIGINS`, optional SMTP/storage vars |
| Scheduled session end / winner finalize | `DATABASE_URL` |
| Outbid / notification email | `DATABASE_URL`, `SMTP_*`, `FRONTEND_RESET_PASSWORD_URL` |
| Image processing on upload | `S3_BUCKET_NAME`, `S3_REGION`, IAM role (not env keys in prod) |
| Frontend static hosting (S3/CloudFront) | `VITE_API_BASE_URL`, `VITE_WS_BASE_URL` at **build time** only |

Lambda does **not** need Docker Compose variables (`MYSQL_CONTAINER_NAME`, `BACKEND_HOST_PORT`, etc.) or frontend dev polling flags.

---

*Generated from `.env.example` files, `docker-compose.yml`, Dockerfiles, `backend/app/core/config.py`, and frontend source references.*
