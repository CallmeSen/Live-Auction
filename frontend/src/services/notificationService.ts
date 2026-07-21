import { createDefaultNotificationList } from '../defaults/notificationDefaults';
import type { ApiResponse } from '../interfaces/common';
import type {
  MarkAllNotificationsReadResponse,
  MarkNotificationReadResponse,
  NotificationListRequest,
  NotificationListResponse,
} from '../interfaces/notification';
import axiosClient from './axiosClient';

export const notificationService = {
  // TODO(BACKEND): GET /notifications chua duoc trien khai.
  async getNotifications(
    params: NotificationListRequest = {},
  ): Promise<NotificationListResponse> {
    try {
      const response = await axiosClient.get<
        ApiResponse<NotificationListResponse>
      >('/notifications', { params });

      return response.data.data;
    } catch {
      return createDefaultNotificationList(params);
    }
  },

  // TODO(BACKEND): PATCH /notifications/{notificationId}/read chua duoc trien khai.
  async markAsRead(
    notificationId: string,
  ): Promise<MarkNotificationReadResponse> {
    const response = await axiosClient.patch<
      ApiResponse<MarkNotificationReadResponse>
    >(`/notifications/${notificationId}/read`);

    return response.data.data;
  },

  // TODO(BACKEND): PATCH /notifications/read-all chua duoc trien khai.
  async markAllAsRead(): Promise<MarkAllNotificationsReadResponse> {
    const response = await axiosClient.patch<
      ApiResponse<MarkAllNotificationsReadResponse>
    >('/notifications/read-all');

    return response.data.data;
  },
};
