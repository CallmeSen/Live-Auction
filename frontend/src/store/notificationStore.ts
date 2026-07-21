import type {
  AuthUser,
  UserRole,
} from '../features/auth/types';

export type NotificationType =
  | 'BID'
  | 'AUCTION'
  | 'SYSTEM';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  createdAt: string;
  actionUrl?: string;
  recipientIds?: string[];
  recipientRoles?: UserRole[];
}

export interface NotificationView
  extends AppNotification {
  isRead: boolean;
}

export const NOTIFICATION_CHANGED_EVENT =
  'live-auction-notification-changed';

/**
 * Backend hiện chưa cung cấp API thông báo.
 * Trả về mảng rỗng thay vì sử dụng dữ liệu mock.
 */
export const getNotificationsForUser = (
  user: AuthUser,
): NotificationView[] => {
  void user;
  return [];
};

/**
 * Chưa thực hiện được cho đến khi backend có API
 * cập nhật trạng thái đã đọc.
 */
export const markNotificationAsRead = (
  userId: string,
  notificationId: string,
) => {
  void userId;
  void notificationId;
};

/**
 * Chưa thực hiện được cho đến khi backend có API
 * đánh dấu tất cả thông báo đã đọc.
 */
export const markAllNotificationsAsRead = (
  userId: string,
  notificationIds: string[],
) => {
  void userId;
  void notificationIds;
};