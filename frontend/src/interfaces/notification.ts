export type NotificationType =
  | 'BID'
  | 'AUCTION'
  | 'SYSTEM';

export interface NotificationListRequest {
  page?: number;
  size?: number;
  unreadOnly?: boolean;
}

export interface NotificationResponse {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  createdAt: string;
  actionUrl: string | null;
  isRead: boolean;
}

export interface NotificationListResponse {
  items: NotificationResponse[];
  page: number;
  size: number;
  total: number;
  unreadCount: number;
}

export interface MarkNotificationReadResponse {
  id: string;
  isRead: boolean;
}

export interface MarkAllNotificationsReadResponse {
  updatedCount: number;
}
