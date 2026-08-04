import type { ApiResponse } from '../interfaces/common';
import type {
  NotificationPreferenceResponse,
  UpdateNotificationPreferenceRequest,
  UpdateUserProfileRequest,
  UserListRequest,
  UserListResponse,
  UserProfileResponse,
} from '../interfaces/user';
import axiosClient from './axiosClient';

export const userService = {
  async getProfile(): Promise<UserProfileResponse> {
    const response = await axiosClient.get<
      ApiResponse<UserProfileResponse>
    >('/users/me');

    return response.data.data;
  },

  async updateProfile(
    payload: UpdateUserProfileRequest,
  ): Promise<UserProfileResponse> {
    const response = await axiosClient.patch<
      ApiResponse<UserProfileResponse>
    >('/users/me', payload);

    return response.data.data;
  },

  // TODO(BACKEND): GET /users/me/notification-preferences chua duoc trien khai.
  async getNotificationPreferences(): Promise<NotificationPreferenceResponse> {
    const response = await axiosClient.get<
      ApiResponse<NotificationPreferenceResponse>
    >('/users/me/notification-preferences');

    return response.data.data;
  },

  // TODO(BACKEND): PATCH /users/me/notification-preferences chua duoc trien khai.
  async updateNotificationPreferences(
    payload: UpdateNotificationPreferenceRequest,
  ): Promise<NotificationPreferenceResponse> {
    const response = await axiosClient.patch<
      ApiResponse<NotificationPreferenceResponse>
    >('/users/me/notification-preferences', payload);

    return response.data.data;
  },

  async getUsers(
    params: UserListRequest = {},
  ): Promise<UserListResponse> {
    const response = await axiosClient.get<
      ApiResponse<UserListResponse>
    >('/admin/users', { params });

    return response.data.data;
  },
};
