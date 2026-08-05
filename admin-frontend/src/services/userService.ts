import type { ApiResponse } from '../interfaces/common';
import type {
  UpdateUserProfileRequest,
  UserListRequest,
  UserListResponse,
  UserProfileResponse,
} from '../interfaces/user';
import axiosClient from './axiosClient';

export const userService = {
  async getUsers(params: UserListRequest = {}): Promise<UserListResponse> {
    const response = await axiosClient.get<ApiResponse<UserListResponse>>('/admin/users', { params });
    return response.data.data;
  },

  async getProfile(): Promise<UserProfileResponse> {
    const response = await axiosClient.get<ApiResponse<UserProfileResponse>>('/users/me');
    return response.data.data;
  },

  async updateProfile(payload: UpdateUserProfileRequest): Promise<UserProfileResponse> {
    const response = await axiosClient.patch<ApiResponse<UserProfileResponse>>('/users/me', payload);
    return response.data.data;
  },
};
