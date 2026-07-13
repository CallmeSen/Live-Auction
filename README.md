# Live Auction Backend

A FastAPI backend for a live auction application.

The backend currently supports:


* JWT access token generation
* MySQL database
* SQLAlchemy async database access
* Docker and Docker Compose
* Swagger API documentation

## Technology Stack

* Python 3.11
* FastAPI
* Uvicorn
* SQLAlchemy Async
* MySQL 8
* AsyncMy
* Pydantic Settings
* bcrypt
* PyJWT
* Docker
* Docker Compose

# Project Structure

```text
Live-Auction/
├── .env
├── .env.example
├── .gitignore
├── docker-compose.yml
└── backend/
    ├── app/
    │   ├── core/
    │   │   ├── config.py
    │   │   ├── database.py
    │   │   └── security.py
    │   └── main.py
    ├── modules/
    │   ├── auth/
    │   │   ├── auth_router.py
    │   │   ├── auth_schema.py
    │   │   └── auth_service.py
    │   └── users/
    │       ├── user_model.py
    │       └── user_repository.py
    ├── .env
    ├── .env.example
    ├── .dockerignore
    ├── Dockerfile
    └── requirements.txt
```


Docker Compose starts the backend and MySQL together so developers do not need to install and configure MySQL manually.

# Requirements

Before running the project, install:

* Git
* Docker Desktop
* Docker Compose
* Python 3.11, only if running without Docker

Check Docker:

```powershell
docker version
docker compose version
```

Docker Desktop must be running before using Docker commands.

# Environment Configuration

## Root `.env`

Create a `.env` file in the same folder as `docker-compose.yml`.

```env
MYSQL_CONTAINER_NAME=auction-mysql
MYSQL_ROOT_PASSWORD=change_this_root_password
MYSQL_DATABASE=auction_db
MYSQL_USER=auction_user
MYSQL_PASSWORD=change_this_user_password

MYSQL_HOST_PORT=3307
MYSQL_CONTAINER_PORT=3306

BACKEND_CONTAINER_NAME=auction-backend
BACKEND_HOST_PORT=8000
BACKEND_CONTAINER_PORT=8000

DATABASE_URL=mysql+asyncmy://auction_user:change_this_user_password@mysql:3306/auction_db

JWT_SECRET_KEY=replace_with_a_long_random_secret
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
```

Generate a secure JWT secret:

```powershell
python -c "import secrets; print(secrets.token_hex(32))"
```

Copy the generated value into:

```env
JWT_SECRET_KEY=generated-value
```

## Local backend `.env`

Create:

```text
backend/.env
```

Use this file only when running FastAPI directly on Windows:

```env
DATABASE_URL=mysql+asyncmy://auction_user:change_this_user_password@localhost:3307/auction_db

JWT_SECRET_KEY=replace_with_the_same_or_another_local_secret
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
```

The database host is different depending on where FastAPI runs.

When FastAPI runs inside Docker:

```text
mysql:3306
```

When FastAPI runs directly on Windows:

```text
localhost:3307
```

# Run the Project with Docker

## Problem 1: Docker must build the FastAPI image

The backend image needs Python, project files, and packages from `requirements.txt`.

## Solution

From the project root:

```powershell
cd C:\Users\ADMIN\Documents\dhsg\projects\Live-Auction
```

Build and start all services:

```powershell
docker compose up --build -d
```

Docker will:

```text
Build backend image
    ↓
Create Docker network
    ↓
Start MySQL container
    ↓
Wait for MySQL health check
    ↓
Start FastAPI container
```

## Check container status

```powershell
docker compose ps
```

Expected result:

```text
auction-mysql      Up (healthy)
auction-backend    Up
```

## View backend logs

```powershell
docker compose logs -f backend
```

A successful startup contains:

```text
Application startup complete.
```

## View MySQL logs

```powershell
docker compose logs -f mysql
```

## Open Swagger

Open:

```text
http://localhost:8000/docs
```

OpenAPI JSON:

```text
http://localhost:8000/openapi.json
```

# Stop the Project

Stop and remove containers and the project network:

```powershell
docker compose down
```

This keeps the MySQL volume and database data.

Stop and delete the MySQL volume:

```powershell
docker compose down -v
```

Warning:

```text
docker compose down -v
```

deletes the database data stored in the Docker volume.

# Restart the Project

Restart all services:

```powershell
docker compose restart
```

Restart only the backend:

```powershell
docker compose restart backend
```

Restart only MySQL:

```powershell
docker compose restart mysql
```

# Rebuild After Dependency Changes

When Python source code changes, Uvicorn reload usually detects the change automatically because the backend folder is mounted into the container.

When `requirements.txt` or `Dockerfile` changes, rebuild the image:

```powershell
docker compose up --build -d
```

Force a clean backend rebuild:

```powershell
docker compose build --no-cache backend
docker compose up -d
```

# Recreate Containers After `.env` Changes

Changing `.env` does not automatically update environment variables inside an existing container.

Recreate the containers:

```powershell
docker compose up -d --force-recreate
```

Or:

```powershell
docker compose down
docker compose up --build -d
```

# Run the Backend Locally

Use this method when MySQL runs in Docker but FastAPI runs directly on Windows.

## Problem 1: The backend needs an isolated Python environment

Different Python projects may require different package versions.

## Solution

Go to the backend folder:

```powershell
cd C:\Users\ADMIN\Documents\dhsg\projects\Live-Auction\backend
```

Create a virtual environment:

```powershell
python -m venv .venv
```

Activate it:

```powershell
.\.venv\Scripts\Activate.ps1
```

A successful activation shows:

```text
(.venv) PS ...
```

## Problem 2: The backend dependencies must be installed

## Solution

Upgrade pip:

```powershell
python -m pip install --upgrade pip setuptools wheel
```

Install dependencies:

```powershell
python -m pip install -r requirements.txt
```

## Problem 3: MySQL must be running

Start only MySQL through Docker:

```powershell
cd ..
docker compose up -d mysql
```

Check its status:

```powershell
docker compose ps
```

## Problem 4: FastAPI must use the local database URL

The local backend must connect through the Windows host port:

```env
DATABASE_URL=mysql+asyncmy://auction_user:password@localhost:3307/auction_db
```

This value belongs in:

```text
backend/.env
```

## Problem 5: Start FastAPI

Return to the backend folder:

```powershell
cd backend
```

Run:

```powershell
python -m uvicorn app.main:app --reload
```

Open:

```text
http://127.0.0.1:8000/docs
```

# API Endpoints

## Register User

```http
POST /api/v1/auth/register
```

Example request:

```json
{
  "email": "seller@gmail.com",
  "password": "123456",
  "fullName": "Nguyen Van A",
  "phone": "0901234567"
}
```

## Login User

```http
POST /api/v1/auth/login
```

Example request:

```json
{
  "email": "seller@gmail.com",
  "password": "123456"
}
```

Example success response:

```json
{
  "status": 200,
  "code": 1000,
  "message": "Login successfully",
  "data": {
    "accessToken": "jwt-token",
    "tokenType": "Bearer",
    "user": {
      "id": "user-uuid",
      "email": "seller@gmail.com",
      "fullName": "Nguyen Van A",
      "role": "USER",
      "status": "ACTIVE"
    }
  }
}
```

# Database Commands

Enter the MySQL container:

```powershell
docker compose exec mysql mysql -u root -p
```

Enter the root password from `.env`.

Show databases:

```sql
SHOW DATABASES;
```

Select the auction database:

```sql
USE auction_db;
```

Show tables:

```sql
SHOW TABLES;
```

View users:

```sql
SELECT id, email, full_name, role, status
FROM users;
```

Exit MySQL:

```sql
exit;
```

# Useful Docker Commands

Show running containers:

```powershell
docker ps
```

Show all containers:

```powershell
docker ps -a
```

Show Compose services:

```powershell
docker compose ps
```

Show recent backend logs:

```powershell
docker compose logs --tail=50 backend
```

Follow new backend logs:

```powershell
docker compose logs -f --tail=20 backend
```

Enter the backend container:

```powershell
docker compose exec backend sh
```

Check installed Python packages:

```powershell
docker compose exec backend python -m pip list
```

Compile-check Python files:

```powershell
docker compose exec backend python -m compileall app modules
```

Display the final Compose configuration:

```powershell
docker compose config
```

Do not share the output publicly because it may contain environment secrets.

# Common Errors

## Container name already exists

Error:

```text
The container name "/auction-mysql" is already in use
```

Remove the old container:

```powershell
docker rm -f auction-mysql
```

Then run:

```powershell
docker compose up --build -d
```

## Missing `cryptography`

Error:

```text
cryptography package is required for caching_sha2_password
```

Add to `requirements.txt`:

```text
cryptography
```

Then rebuild:

```powershell
docker compose build --no-cache backend
docker compose up -d
```

## Missing environment variable

Error:

```text
database_url
Field required
```

Check:

```text
Live-Auction/.env
backend/.env
```

Verify Compose variables:

```powershell
docker compose config
```

## Wrong database host

Inside Docker, use:

```env
DATABASE_URL=mysql+asyncmy://user:password@mysql:3306/auction_db
```

For local FastAPI, use:

```env
DATABASE_URL=mysql+asyncmy://user:password@localhost:3307/auction_db
```

## Port already in use

Check which process uses port `8000`:

```powershell
netstat -ano | findstr :8000
```

Do not run local Uvicorn and the Docker backend on port `8000` at the same time.

## Python indentation error

Check Python syntax:

```powershell
docker compose exec backend python -m compileall app modules
```

Use four spaces for each Python indentation level.

## Old errors still appear in logs

Docker logs keep historical messages.

View only recent logs:

```powershell
docker compose logs --tail=30 backend
```

# Git Ignore

Do not commit environment secrets, virtual environments, or generated Python files.

Example `.gitignore`:

```gitignore
# Environment variables
.env
backend/.env

# Python
.venv/
backend/.venv/
__pycache__/
*.pyc
*.pyo
*.pyd

# IDE
.vscode/
.idea/

# Testing and cache
.pytest_cache/
.mypy_cache/
```

Commit example configuration files instead:

```text
.env.example
backend/.env.example
```

# Complete Docker Execution Flow

```text
Clone the project
    ↓
Create root .env
    ↓
Configure MySQL and JWT values
    ↓
Start Docker Desktop
    ↓
Run docker compose up --build -d
    ↓
Docker starts MySQL
    ↓
MySQL becomes healthy
    ↓
Docker starts FastAPI
    ↓
SQLAlchemy connects to auction_db
    ↓
FastAPI application starts
    ↓
Open http://localhost:8000/docs
```

# Quick Start

```powershell
cd C:\Users\ADMIN\Documents\dhsg\projects\Live-Auction

docker compose up --build -d

docker compose ps

docker compose logs --tail=30 backend
```

Open:

```text
http://localhost:8000/docs
```
