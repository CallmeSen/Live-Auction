import type {
  NotificationListRequest,
  NotificationListResponse,
} from '../interfaces/notification';

export const createDefaultNotificationList = (
  request: NotificationListRequest = {},
): NotificationListResponse => ({
  items: [],
  page: request.page ?? 1,
  size: request.size ?? 10,
  total: 0,
  unreadCount: 0,
});
