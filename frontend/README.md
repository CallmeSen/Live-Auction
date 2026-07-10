# Live Auction Frontend

Frontend React + TypeScript + Vite + Tailwind CSS. Bản hiện tại chạy bằng mock data và có phân quyền demo cho bidder, seller và admin.

## Chạy local

```bash
npm install
npm run dev
```

## Tài khoản demo

| Vai trò | Email | Mật khẩu |
|---|---|---|
| Bidder | `user1@gmail.com` | `123456` |
| Seller | `sell1@gmail.com` | `123456` |
| Admin | `admin@gmail.com` | `123456` |

## Chức năng theo vai trò

- Guest: đăng ký, đăng nhập, xem danh sách và chi tiết phiên.
- Bidder: đặt giá, xem My Bids, ví, nạp/rút tiền và hồ sơ.
- Seller: tạo phiên, xem My Auctions, sửa và hủy phiên UPCOMING.
- Admin: dashboard, quản lý tài khoản, kiểm duyệt phiên và danh mục.

## Kết nối backend

Sao chép `.env.example` thành `.env.local` và cấu hình:

```env
VITE_API_BASE_URL=http://localhost:8080/api/v1
```

Các endpoint theo use case đã được khai báo trong `src/api`. Khi backend sẵn sàng, thay nguồn dữ liệu trong `src/mocks` bằng các hàm API tương ứng.

## Kiểm tra

```bash
npm run lint
npm run build
```
url web frontend đã đẩy lên AWS: copy cai link trong ngoặc ->(d2mnpdp12er73n.cloudfront.net)
sửa code → git push develop → GitHub tự cập nhật website
sau k cần chạy code trên vs code nữa, chỉ cần sửa code nếu cần, push lên git nó sẽ tự thông cập nhật web và chạy bằng link trên