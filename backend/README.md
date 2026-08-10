# Backend

Backend gồm hai phần:

1. FastAPI và MySQL để chạy local/legacy bằng Docker Compose.
2. Lambda handlers trong backend/functions cho luồng AWS serverless production.

Production serverless không chạy Uvicorn hoặc MySQL container. Không sửa local
DATABASE_URL rồi kỳ vọng Lambda tự dùng nó; Lambda nhận cấu hình từ Terraform
và DynamoDB/SQS/S3 theo từng stage.

## Yêu cầu

- Python 3.11+ cho FastAPI local
- Python 3.13 khuyến nghị cho test và AWS package build
- Docker Desktop
- PowerShell trên Windows

## Chạy FastAPI và MySQL bằng Docker

Từ repository root, tạo file .env:

~~~powershell
Copy-Item .env.example .env
~~~

Đổi ít nhất các giá trị mẫu sau:

~~~env
MYSQL_ROOT_PASSWORD=<mat-khau-root-mysql-local>
MYSQL_PASSWORD=<mat-khau-user-mysql-local>
JWT_SECRET_KEY=<chuoi-ngau-nhien-dai>
~~~

Nếu cần reset password qua email, điền SMTP app password:

~~~env
SMTP_USERNAME=<email>
SMTP_PASSWORD=<gmail-app-password>
SMTP_FROM_EMAIL=<email>
~~~

Không commit file .env và không dùng password Gmail chính.

Khởi động:

~~~powershell
docker compose up --build -d mysql backend
docker compose ps
docker compose logs --tail=50 backend
~~~

Swagger:

- http://localhost:8000/docs
- http://localhost:8000/openapi.json

Dừng nhưng giữ database volume:

~~~powershell
docker compose down
~~~

Xóa cả database volume:

~~~powershell
docker compose down -v
~~~

Chỉ dùng lệnh xóa volume khi chấp nhận mất toàn bộ dữ liệu MySQL local.

## Chạy FastAPI trực tiếp trên Windows

MySQL vẫn chạy trong Docker, còn Uvicorn chạy trên host:

~~~powershell
docker compose up -d mysql
Set-Location .\backend
Copy-Item .env.example .env
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload
~~~

backend/.env phải dùng host port:

~~~env
DATABASE_URL=mysql+asyncmy://auction_user:<password>@localhost:3307/auction_db
JWT_SECRET_KEY=<chuoi-ngau-nhien-dai>
~~~

Khi backend chạy trong Docker, Compose tự truyền DATABASE_URL với host mysql và
port 3306. Không dùng localhost:3307 bên trong container.

## Migration database

Migration Alembic nằm ở backend/alembic. Chạy từ thư mục backend và bảo đảm
backend/.env trỏ tới database đang chạy:

~~~powershell
Set-Location .\backend
.\.venv\Scripts\Activate.ps1
alembic upgrade head
~~~

Xem hướng dẫn đầy đủ tại backend/alembic/README.

## Test và kiểm tra

~~~powershell
Set-Location .\backend
python -m pytest tests/unit
python -m compileall app modules functions
~~~

Nếu môi trường có nhiều pytest plugin gây lỗi, dùng virtual environment của
repository và không đặt PYTHONPATH trỏ trực tiếp vào backend/common vì có module
tên enum có thể che stdlib enum.

## Build Lambda package

backend/build.ps1 tạo layer hoặc zip cho một function. Script cần Docker để build
dependency đúng Python runtime và dùng requirements.lock hash-locked.

Build layer và function mặc định:

~~~powershell
Set-Location .\backend
.\build.ps1 -Target all -FunctionName query_service
~~~

Chỉ build layer:

~~~powershell
.\build.ps1 -Target layer
~~~

Chỉ build function:

~~~powershell
.\build.ps1 -Target function -FunctionName query_service
~~~

FunctionName hợp lệ gồm:

- bid_processor
- ws_authorizer
- ws_handler
- broadcast
- session_service
- item_service
- query_service
- admin_command
- cognito_post_confirm

Output nằm trong backend/build và không được commit.

## AWS và Terraform

Khi thao tác AWS, chỉ dùng profile la-admin:

~~~powershell
aws sts get-caller-identity --profile la-admin --region ap-southeast-1
~~~

Không dùng root và không đưa credential vào .env để deploy Lambda. Terraform lấy
artifact, IAM, state và runtime values theo module. Đọc README root và
docs/aws-self-hosted-setup.md trước khi apply.

## Lỗi thường gặp

### database_url không tồn tại

Kiểm tra backend/.env khi chạy Uvicorn trực tiếp, hoặc root .env khi chạy Docker
Compose. Sau khi đổi .env, recreate container:

~~~powershell
docker compose up -d --force-recreate backend
~~~

### Sai database host

- Uvicorn trên host: localhost:3307
- Backend trong Docker: mysql:3306

### Port 8000 hoặc 3307 đã được dùng

~~~powershell
netstat -ano | findstr :8000
netstat -ano | findstr :3307
~~~

Không chạy đồng thời hai backend cùng port.

### Build Lambda thiếu Docker

Mở Docker Desktop rồi chạy lại build.ps1. Không tự pip install dependency
Linux vào máy Windows để thay cho package build của Lambda.

