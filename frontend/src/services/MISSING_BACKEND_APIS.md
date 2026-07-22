# Backend APIs còn thiếu

Các method đã được khai báo trong service và có request/response interface.
Frontend chưa gọi các method này cho đến khi backend triển khai xong.

| Nhóm | Method | Endpoint dự kiến | Service |
| --- | --- | --- | --- |
| Quên mật khẩu | POST | `/auth/forgot-password` | `authService.forgotPassword` |
| Đặt lại mật khẩu | POST | `/auth/reset-password` | `authService.resetPassword` |
| Danh sách user | GET | `/admin/users` | `adminService.getUsers` |
| Khóa/mở user | PATCH | `/admin/users/{userId}/status` | `adminService.updateUserStatus` |
| Duyệt phiên | PATCH | `/admin/auction-sessions/{sessionId}/active` | `auctionSessionService.activeSession` |
| Dừng phiên | PATCH | `/admin/auction-sessions/{sessionId}/cancel` | `auctionSessionService.cancelSession` |
| Upload ảnh vật phẩm | POST | `/auction-items/{itemId}/images` | `auctionItemService.uploadImage` |
| Xem hồ sơ | GET | `/users/me` | `userService.getProfile` |
| Cập nhật hồ sơ | PATCH | `/users/me` | `userService.updateProfile` |
| Xem tùy chọn thông báo | GET | `/users/me/notification-preferences` | `userService.getNotificationPreferences` |
| Cập nhật tùy chọn thông báo | PATCH | `/users/me/notification-preferences` | `userService.updateNotificationPreferences` |
| Danh sách thông báo | GET | `/notifications` | `notificationService.getNotifications` |
| Đánh dấu đã đọc | PATCH | `/notifications/{notificationId}/read` | `notificationService.markAsRead` |
| Đánh dấu tất cả đã đọc | PATCH | `/notifications/read-all` | `notificationService.markAllAsRead` |

Tìm nhanh toàn bộ vị trí cần backend triển khai:

```text
TODO(BACKEND)
```
