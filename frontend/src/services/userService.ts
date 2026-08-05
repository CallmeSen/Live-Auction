import type { ApiResponse } from '../interfaces/common';
import type { UpdateUserProfileRequest, UserProfileResponse } from '../interfaces/user';
import axiosClient from './axiosClient';
export const userService = {
  async getProfile(): Promise<UserProfileResponse> {
    const response = await axiosClient.get<ApiResponse<UserProfileResponse>>('/users/me');
    return response.data.data;
  },
  async updateProfile(payload: UpdateUserProfileRequest): Promise<UserProfileResponse> {
    const response = await axiosClient.patch<ApiResponse<UserProfileResponse>>('/users/me', payload);
    return response.data.data;
  },
};
