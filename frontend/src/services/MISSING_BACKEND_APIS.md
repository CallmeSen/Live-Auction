# Backend APIs còn thiếu

Các method đã được khai báo trong service và có request/response interface.
Frontend chưa gọi các method này cho đến khi backend triển khai xong.

| Nhóm | Method | Endpoint dự kiến | Service |
| --- | --- | --- | --- |
| Quên mật khẩu | POST | `/auth/forgot-password` | `authService.forgotPassword` |.  **** ĐÃ HOÀN THÀNH ****
| Đặt lại mật khẩu | POST | `/auth/reset-password` | `authService.resetPassword` |. **** ĐÃ HOÀN THÀNH ****
| Danh sách user | GET | `/admin/users` | `adminService.getUsers` |          **** ĐÃ HOÀN THÀNH ****
| Khóa/mở user | PATCH | `/admin/users/{userId}/status` | `adminService.updateUserStatus` |          **** ĐÃ HOÀN THÀNH ****
| Duyệt phiên | PATCH | `/admin/auction-sessions/{sessionId}/approve` | `auctionSessionService.approveSession` **** ĐÃ HOÀN THÀNH ****
| Dừng phiên | PATCH | `/admin/auction-sessions/{sessionId}/reject` | `auctionSessionService.rejectSession` |  **** ĐÃ HOÀN THÀNH ****
| Danh sách phiên chưa duyệt | PATCH | `/admin/auction-sessions/pending` |          **** ĐÃ HOÀN THÀNH ****
| Upload ảnh vật phẩm | POST | `/auction-items/{itemId}/images` | `auctionItemService.uploadImage` |
| Xem hồ sơ | GET | `/users/me` | `userService.getProfile` |          **** ĐÃ HOÀN THÀNH ****
| Cập nhật hồ sơ | PATCH | `/users/me` | `userService.updateProfile` |          **** ĐÃ HOÀN THÀNH ****
| Xem tùy chọn thông báo | GET | `/users/me/notification-preferences` | `userService.getNotificationPreferences`**** ĐÃ HOÀN THÀNH ****
| Cập nhật tùy chọn thông báo | PATCH | `/users/me/notification-preferences` | `userService.updateNotificationPreferences` |  **** ĐÃ HOÀN THÀNH ****
| Danh sách thông báo | GET | `/notifications` | `notificationService.getNotifications` |          **** ĐÃ HOÀN THÀNH ****
| Đánh dấu đã đọc | PATCH | `/notifications/{notificationId}/read` | `notificationService.markAsRead` |          **** ĐÃ HOÀN THÀNH ****
| Đánh dấu tất cả đã đọc | PATCH | `/notifications/read-all` | `notificationService.markAllAsRead` |          **** ĐÃ HOÀN THÀNH ****

Tìm nhanh toàn bộ vị trí cần backend triển khai:

```text
TODO(BACKEND)
```
**** Để chạy dự án, dùng tính năng quên mật khẩu cần:
Điền vào file .env:

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=youremail@gmail.com
SMTP_PASSWORD=abcdefghijklmnop
SMTP_FROM_EMAIL=youremail@gmail.com
FRONTEND_RESET_PASSWORD_URL=http://localhost:5173/reset-password
PASSWORD_RESET_TOKEN_EXPIRE_MINUTES=15


Bước 1: Bật 2-Step Verification cho tài khoản Gmail

App Password chỉ xuất hiện khi tài khoản Google đã bật xác minh 2 bước — nếu chưa bật, Google sẽ không cho tạo App Password.

Vào https://myaccount.google.com/security
Tìm mục "2-Step Verification" (Xác minh 2 bước)
Nếu đang tắt → bấm vào, làm theo hướng dẫn (thường cần xác nhận qua số điện thoại)
Sau khi bật xong, quay lại bước 2
Bước 2: Tạo App Password
Vào thẳng link: https://myaccount.google.com/apppasswords
(Nếu Google chặn không cho vào thẳng, tìm theo đường: Security → 2-Step Verification → cuộn xuống dưới cùng → "App passwords")
Ở ô "App name", gõ tên bất kỳ để dễ nhớ, ví dụ: Live Auction Backend
Bấm "Create" (Tạo)
Google hiện ra 1 mã gồm 16 ký tự, dạng: abcd efgh ijkl mnop
Copy mã này ngay — Google chỉ hiện 1 lần duy nhất, đóng popup là mất, phải tạo lại cái mới nếu quên copy.


ở file env
==>> giữ nguyên các trường thông tin này:
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
FRONTEND_RESET_PASSWORD_URL=http://localhost:5173/reset-password
PASSWORD_RESET_TOKEN_EXPIRE_MINUTES=15
==>> Thay đổi thông tin trường này:
SMTP_USERNAME=youremail@gmail.com (dùng gmail thật đã kích hoạt app password)
SMTP_PASSWORD=abcdefghijklmnop  (dùng mật khẩu lấy được ở bước 2 bỏ qua dấu cách)
SMTP_FROM_EMAIL=youremail@gmail.com (dùng gmail thật đã kích hoạt app password)

sau đó khởi chạy lại:

docker compose down -v
docker compose up --build -d


