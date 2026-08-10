# Admin Frontend

React + TypeScript + Vite + Tailwind CSS cho tài khoản quản trị. Admin frontend
dùng Cognito để đăng nhập và gọi admin control plane qua API Gateway REST.

## URL production

https://d109et9edc4f35.cloudfront.net/admin

Các chức năng chính:

- Dashboard và số liệu vận hành
- Danh sách và kiểm duyệt phiên đấu giá
- Quản lý user/admin account
- Quản lý danh mục
- Audit events
- Pause, resume, approve, close và cancel theo quyền admin

Không dùng tài khoản demo hoặc password ghi trong README cũ. Tài khoản admin
phải tồn tại trong Cognito user pool và thuộc group ADMIN.

## Yêu cầu

- Node.js >= 20
- npm
- AWS CLI v2 nếu deploy
- Terraform state của identity, API và edge đã sẵn sàng nếu deploy production

## Chạy local

~~~powershell
Set-Location .\admin-frontend
npm install --registry https://registry.npmjs.org/
Copy-Item .env.example .env.local
npm run dev
~~~

Mở http://localhost:5174 nếu port Vite được cấu hình mặc định cho admin app.

### Các biến .env.local phải điền

| Biến | Nguồn |
|---|---|
| VITE_AWS_REGION | Region hiện tại: ap-southeast-1 |
| VITE_COGNITO_USER_POOL_ID | terraform output của infra/03-identity |
| VITE_COGNITO_CLIENT_ID | terraform output của infra/03-identity |
| VITE_REST_API_URL | stage3_rest_invoke_url của infra/07-api |
| VITE_REST_API_KEY | API Gateway key hiện tại; không commit |
| VITE_USER_APP_URL | URL user CloudFront, hiện tại https://d1bt4phb59xk5x.cloudfront.net |

Không dùng VITE_API_BASE_URL cũ cho serverless admin app. Vite nhúng biến VITE
vào bundle; API key không phải secret backend nhưng vẫn không được commit.

## Deploy production

Chạy từ repository root:

~~~powershell
aws sts get-caller-identity --profile la-admin --region ap-southeast-1
.\admin-frontend\deploy.ps1
.\admin-frontend\deploy.ps1 -Apply
~~~

Không có -Apply chỉ chạy preflight. Có -Apply sẽ:

1. Kiểm tra caller đúng la-admin/account/region.
2. Đọc output edge, identity và API.
3. Lấy API key trong process-local environment.
4. Build admin frontend.
5. Sync admin-frontend/dist lên S3.
6. Cập nhật content type cho JavaScript.
7. Tạo CloudFront invalidation.

### Các biến cần kiểm tra trong deploy.ps1

Mở admin-frontend/deploy.ps1 và chỉ sửa khi deployment target thực sự thay
đổi:

| Biến | Giá trị hiện tại |
|---|---|
| $AwsProfile | la-admin |
| $AwsRegion | ap-southeast-1 |
| $ExpectedAccount | 233376973052 |
| $ExpectedArn | arn:aws:iam::233376973052:user/la-admin |

Không điền API key vào script. Script lấy API key từ API Gateway rồi khôi phục
biến môi trường sau khi build. Nếu STS trả account/ARN khác, dừng lại; không
dùng root và không bỏ caller gate bằng cách sửa account cho khớp giả.

Account khác chưa portable chỉ bằng cách đổi bốn biến trên. Đọc
docs/aws-self-hosted-setup.md trước khi sử dụng account khác.

## Kiểm tra

~~~powershell
npm run typecheck
npm run lint
npm test
npm run build
~~~

Admin app không dùng live bidder E2E. Test dashboard cần user Cognito thuộc
group ADMIN và dữ liệu đã có trong DynamoDB.

## Quyền và bảo mật

- Chỉ user trong group ADMIN mới được gọi admin route.
- UI role guard không thay thế authorization ở Lambda/API Gateway.
- Không dùng root để tạo admin hoặc deploy.
- Không gửi password, access token hoặc API key vào chat.
- Không commit .env, .env.local, dist, test-results hoặc Terraform state.

## Lỗi thường gặp

### Dashboard không tải dữ liệu

Kiểm tra user đang đăng nhập đúng Cognito pool/client, thuộc group ADMIN, REST
API URL đúng stage và API key còn hiệu lực. Mở DevTools Network để xem status,
không copy Authorization header ra ngoài.

### deploy.ps1 báo unexpected AWS caller

~~~powershell
aws configure list --profile la-admin
aws sts get-caller-identity --profile la-admin --region ap-southeast-1
aws sso login --profile la-admin
~~~

Chỉ chạy sso login nếu profile dùng AWS IAM Identity Center.

### Admin URL trả HTML nhưng route không hoạt động

Chờ CloudFront invalidation hoàn tất, sau đó kiểm tra bundle mới. Không xóa
distribution hoặc bucket để xử lý lỗi frontend.
