# Live Auction

Hệ thống đấu giá realtime gồm frontend người dùng, admin frontend, backend
FastAPI local và luồng AWS serverless hiện tại.

## Trạng thái hiện tại

Production dùng Cognito, API Gateway, Lambda, DynamoDB, S3, WebSocket API và
CloudFront. Thiết kế serverless hiện tại không cần tự tạo VPC, 2 AZ, Aurora,
ECS hoặc ALB cho luồng này.

URL đang deploy:

- User app: https://d1bt4phb59xk5x.cloudfront.net
- Admin app: https://d109et9edc4f35.cloudfront.net/admin

Không mặc định coi git push là deploy. Cách deploy được kiểm soát trong repo là
chạy script deploy tương ứng, trừ khi pipeline đã được cấu hình và đã kiểm tra
rõ stage deploy.

## Quy tắc AWS bắt buộc

Mọi lệnh AWS và Terraform phải dùng IAM profile la-admin, không dùng root:

~~~powershell
$env:AWS_PROFILE = 'la-admin'
$env:AWS_REGION = 'ap-southeast-1'

aws sts get-caller-identity --profile la-admin --region ap-southeast-1
~~~

Caller hiện tại phải thuộc account 233376973052 và ARN:

~~~text
arn:aws:iam::233376973052:user/la-admin
~~~

Nếu STS trả root, account khác hoặc token hết hạn thì dừng lại. Không đổi sang
root để vượt lỗi quyền. Với SSO, đăng nhập lại:

~~~powershell
aws sso login --profile la-admin
~~~

Không commit access key, secret key, API key, Cognito password, file .env,
.env.local, Terraform plan hoặc state.

## Công cụ cần có

- Git
- AWS CLI v2
- Terraform >= 1.7
- Node.js >= 20 và npm
- Python 3.11+ cho FastAPI local; Python 3.13 khuyến nghị cho AWS build/test
- Docker Desktop nếu chạy MySQL/FastAPI local hoặc build Lambda package

Cài trên Windows bằng Chocolatey:

~~~powershell
choco install git terraform awscli nodejs-lts python docker-desktop -y
~~~

Đóng rồi mở lại PowerShell sau khi cài. Kiểm tra:

~~~powershell
git --version
terraform version
aws --version
node --version
npm --version
python --version
docker version
~~~

## Cấu trúc chính

~~~text
frontend/          User React app và script deploy CloudFront
admin-frontend/    Admin React app và script deploy CloudFront
backend/           FastAPI local, Lambda handlers và package build
infra/             Terraform theo module/stage
docs/              Runbook, design và backlog
~~~

## Chạy frontend local

Frontend hiện tại gọi AWS serverless API, không dùng tài khoản demo trong README
cũ. Từ thư mục frontend:

~~~powershell
Set-Location .\frontend
npm install --registry https://registry.npmjs.org/
Copy-Item .env.example .env.local
npm run dev
~~~

.env.local phải có:

| Biến | Cần điền |
|---|---|
| VITE_AWS_REGION | Region Cognito/API, hiện tại ap-southeast-1 |
| VITE_COGNITO_USER_POOL_ID | Output từ infra/03-identity |
| VITE_COGNITO_CLIENT_ID | Output từ infra/03-identity |
| VITE_REST_API_URL | Output stage3_rest_invoke_url từ infra/07-api |
| VITE_REST_API_KEY | API key lấy process-local khi deploy, không commit |
| VITE_WS_URL | Output websocket_url từ infra/07-api |
| VITE_MEDIA_BASE_URL | Output media CloudFront từ infra/09-edge |

Không tự điền giá trị giả vào production. Script deploy tự lấy các output và API
key nên không cần ghi API key vào source.

## Deploy frontend lên AWS

Chạy từ repository root sau khi STS preflight pass:

~~~powershell
aws sts get-caller-identity --profile la-admin --region ap-southeast-1
.\frontend\deploy.ps1
.\frontend\deploy.ps1 -Apply
~~~

Không có -Apply chỉ chạy preflight. Có -Apply sẽ build frontend, sync lên S3 và
tạo CloudFront invalidation.

### Các dòng cần điền trong frontend/deploy.ps1

| Biến | Giá trị hiện tại | Ý nghĩa |
|---|---|---|
| $AwsProfile | la-admin | Tên profile AWS trên máy |
| $AwsRegion | ap-southeast-1 | Region của resource |
| $ExpectedAccount | 233376973052 | Account ID để chặn nhầm account |
| $ExpectedArn | arn:aws:iam::233376973052:user/la-admin | Caller ARN được phép deploy |

Không điền VITE_REST_API_KEY hoặc password vào script. Script lấy API key từ API
Gateway trong process hiện tại rồi khôi phục biến môi trường sau khi chạy.

Nếu dùng account khác, không chỉ sửa bốn dòng trên. Terraform, remote state,
IAM ARN, Cognito, CloudFront và integration test hiện còn pin vào account deploy
hiện tại. Đọc docs/aws-self-hosted-setup.md và hoàn tất portability trước khi
apply account khác.

## Deploy admin frontend

~~~powershell
aws sts get-caller-identity --profile la-admin --region ap-southeast-1
.\admin-frontend\deploy.ps1
.\admin-frontend\deploy.ps1 -Apply
~~~

Các biến pin trong admin-frontend/deploy.ps1 có cùng ý nghĩa với user frontend.
Runtime admin cần VITE_USER_APP_URL là URL CloudFront của user app. Script tự lấy
giá trị này từ Terraform output.

## Terraform serverless

Không chạy terraform apply ở root repository và không apply toàn bộ infra một
lần. Thứ tự có dependency là:

~~~text
03-identity
04-data
05-messaging
06-compute
06-compute/stage3-control-plane
07-api
09-edge
frontend/deploy.ps1
admin-frontend/deploy.ps1
~~~

Mỗi module phải được init, plan và review riêng:

~~~powershell
$env:AWS_PROFILE = 'la-admin'
$env:AWS_REGION = 'ap-southeast-1'
terraform -chdir=infra/07-api init
terraform -chdir=infra/07-api plan -var="enable_stage3=true" -var="aws_region=ap-southeast-1" -out=stage3.tfplan
terraform -chdir=infra/07-api show -no-color stage3.tfplan
terraform -chdir=infra/07-api apply stage3.tfplan
~~~

Chỉ apply khi plan không có destroy/replace ngoài phạm vi task. Luôn đọc
summary add/change/destroy trước khi apply. Không xóa state bucket hoặc lock
table khi chưa hiểu dependency.

Bootstrap state và quy trình account mới được ghi trong
docs/aws-self-hosted-setup.md.

## Chạy backend local bằng Docker

Backend FastAPI là luồng local/legacy; production serverless chạy Lambda trong
backend/functions. Từ repository root:

~~~powershell
Copy-Item .env.example .env
~~~

Trong .env, bắt buộc đổi các giá trị mẫu:

~~~env
MYSQL_ROOT_PASSWORD=<mat-khau-root-mysql-local>
MYSQL_PASSWORD=<mat-khau-user-mysql-local>
JWT_SECRET_KEY=<chuoi-ngau-nhien-dai>
~~~

SMTP chỉ cần điền nếu cần gửi email reset password:

~~~env
SMTP_USERNAME=<email>
SMTP_PASSWORD=<gmail-app-password>
SMTP_FROM_EMAIL=<email>
~~~

Không dùng mật khẩu Gmail thật hoặc JWT mẫu. Chạy:

~~~powershell
docker compose up --build -d mysql backend
docker compose ps
docker compose logs --tail=50 backend
~~~

Mở Swagger tại http://localhost:8000/docs. Dừng container nhưng giữ data:

~~~powershell
docker compose down
~~~

Xóa cả volume MySQL chỉ khi chấp nhận mất dữ liệu local:

~~~powershell
docker compose down -v
~~~

Migration Alembic xem tại backend/alembic/README.

## Kiểm tra trước khi deploy

Frontend:

~~~powershell
Set-Location .\frontend
npm run typecheck
npm run lint
npm test
npm run build
~~~

Backend unit test:

~~~powershell
Set-Location .\backend
python -m pytest tests/unit
~~~

Terraform/Pester test:

~~~powershell
Set-Location ..
Invoke-Pester .\infra\tests\stage3-api.Tests.ps1
Invoke-Pester .\infra\tests\stage4-deploy.Tests.ps1
~~~

## Tài liệu liên quan

- docs/aws-self-hosted-setup.md
- docs/live-auction-planning/live-auction-master-backlog.md
- live-auction-full-system-setup-codepipeline.md
- docs/live-auction-planning/emergency-cost-stop-runbook.md

## Nguyên tắc không được bỏ qua

- Không dùng root cho AWS CLI, Terraform hoặc deploy.
- Không gửi credential, API key, token hoặc password vào chat/Git.
- Luôn đọc Terraform plan trước apply.
- Không chạy destroy nếu chưa có plan destroy được review.
- Không coi git push là deploy thành công nếu chưa có pipeline evidence hoặc
  chưa chạy script deploy.
