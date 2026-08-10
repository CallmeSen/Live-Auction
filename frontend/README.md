# User Frontend

React + TypeScript + Vite + Tailwind CSS cho người dùng đấu giá. Frontend hiện
kết nối Cognito, API Gateway REST, WebSocket API và media CloudFront của luồng
AWS serverless.

## URL production

https://d1bt4phb59xk5x.cloudfront.net

Các route chính:

- /login và /register: xác thực Cognito
- /auctions: danh sách phiên
- /auction-items/:id: chi tiết vật phẩm và phòng đấu giá realtime
- /profile: hồ sơ người dùng
- /my-auctions: phiên do người dùng tạo
- /my-bids: lịch sử trả giá

Các route nghiệp vụ yêu cầu đăng nhập. Không dùng tài khoản demo hoặc password
ghi trong README cũ.

## Yêu cầu

- Node.js >= 20
- npm
- AWS runtime values của đúng account nếu gọi API serverless thật

## Chạy local

~~~powershell
Set-Location .\frontend
npm install --registry https://registry.npmjs.org/
Copy-Item .env.example .env.local
npm run dev
~~~

Mở http://localhost:5173.

### Các biến .env.local phải điền

| Biến | Nguồn |
|---|---|
| VITE_AWS_REGION | Region hiện tại: ap-southeast-1 |
| VITE_COGNITO_USER_POOL_ID | terraform output của infra/03-identity |
| VITE_COGNITO_CLIENT_ID | terraform output của infra/03-identity |
| VITE_REST_API_URL | stage3_rest_invoke_url của infra/07-api |
| VITE_REST_API_KEY | API Gateway key hiện tại; không commit |
| VITE_WS_URL | websocket_url của infra/07-api |
| VITE_MEDIA_BASE_URL | media CloudFront origin của infra/09-edge |

Không dùng VITE_API_BASE_URL cũ để cấu hình serverless frontend. Không đưa API
key, token hoặc password vào Git. Vite nhúng các biến VITE vào bundle, vì vậy
đây không phải nơi lưu secret backend.

## Deploy production

Chạy từ repository root:

~~~powershell
aws sts get-caller-identity --profile la-admin --region ap-southeast-1
.\frontend\deploy.ps1
.\frontend\deploy.ps1 -Apply
~~~

Không có -Apply chỉ kiểm tra caller và module Terraform. Có -Apply sẽ:

1. Kiểm tra caller đúng la-admin/account/region.
2. Đọc output từ infra/03-identity, infra/07-api và infra/09-edge.
3. Lấy API key trong process-local environment.
4. Chạy npm run build.
5. Sync frontend/dist lên S3.
6. Cập nhật content type cho JavaScript.
7. Tạo CloudFront invalidation.

### Các biến cần kiểm tra trong deploy.ps1

Mở frontend/deploy.ps1 và chỉ sửa khi deployment target thực sự thay đổi:

| Biến | Giá trị hiện tại |
|---|---|
| $AwsProfile | la-admin |
| $AwsRegion | ap-southeast-1 |
| $ExpectedAccount | 233376973052 |
| $ExpectedArn | arn:aws:iam::233376973052:user/la-admin |

Không điền thủ công các biến VITE trong script deploy. Script lấy chúng từ
Terraform. Nếu STS trả account hoặc ARN khác các giá trị trên, dừng lại; không
dùng root và không chỉ sửa ExpectedAccount để bỏ qua caller gate.

Account khác chưa portable chỉ bằng cách đổi bốn biến này. Xem
docs/aws-self-hosted-setup.md trước khi init/apply state của account khác.

## Kiểm tra

~~~powershell
npm run typecheck
npm run lint
npm test
npm run build
~~~

Mock browser test:

~~~powershell
npm run test:e2e
~~~

Live E2E cần fixture item, hai Cognito test user và các biến môi trường riêng
trong frontend/e2e/live-env.ts. Không ghi username/password vào file hoặc command
history dùng chung.

## Realtime

Trang chi tiết vật phẩm LIVE lấy snapshot qua REST rồi kết nối WebSocket. Giá,
người dẫn đầu, thời điểm kết thúc, reconnect và anti-sniping được cập nhật không
cần reload.

Trang /auctions hiện tải danh sách một lần khi mở hoặc retry; phiên mới xuất hiện
sau đó chưa tự thêm vào danh sách nếu chưa có polling/subscription.

## Lỗi thường gặp

### Runtime config is invalid

Kiểm tra đủ bảy biến VITE, URL production dùng https/wss, region đúng và không
có khoảng trắng đầu/cuối.

### API trả 401

Đăng nhập lại Cognito, kiểm tra user pool/client đúng account và API key đúng
stage. Không copy token vào README hoặc chat.

### deploy.ps1 báo unexpected AWS caller

Chạy:

~~~powershell
aws configure list --profile la-admin
aws sts get-caller-identity --profile la-admin --region ap-southeast-1
~~~

Nếu dùng SSO:

~~~powershell
aws sso login --profile la-admin
~~~

### CloudFront còn bundle cũ

Kiểm tra invalidation trong distribution đúng và chờ status Completed. Không
xóa S3 bucket để xử lý cache.

## Không được commit

- .env hoặc .env.local
- API key, Cognito token/password
- dist/
- Playwright report/test-results
- Terraform state hoặc plan
