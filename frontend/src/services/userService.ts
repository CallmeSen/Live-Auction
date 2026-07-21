import type {
  UserListRequest,
  UserListResponse,
} from '../interfaces/user';
import type { ApiResponse } from '../interfaces/common';
import axiosClient from './axiosClient';

export const userService = {
  async getUsers(
    params: UserListRequest = {},
  ): Promise<UserListResponse> {
    const response = await axiosClient.get<
      ApiResponse<UserListResponse>
    >('/admin/users', { params });

    return response.data.data;
  },
};
