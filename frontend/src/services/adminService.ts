import { createDefaultAdminUserList } from '../defaults/adminDefaults';
import type {
  AdminUserListRequest,
  AdminUserListResponse,
  CreateAdminUserRequest,
  CreateAdminUserResponse,
  UpdateAdminUserStatusRequest,
  UpdateAdminUserStatusResponse,
} from '../interfaces/admin';
import type { ApiResponse } from '../interfaces/common';
import axiosClient from './axiosClient';

export const adminService = {
    async createAdminUser(
        payload: CreateAdminUserRequest,
    ): Promise<CreateAdminUserResponse> {
        const response = await axiosClient.post<
            ApiResponse<CreateAdminUserResponse>
        >('/admin/users', payload);

        return response.data.data;
    },

    // TODO(BACKEND): GET /admin/users chua duoc trien khai.
    async getUsers(
        params: AdminUserListRequest = {},
    ): Promise<AdminUserListResponse> {
        try {
            const response = await axiosClient.get<
                ApiResponse<AdminUserListResponse>
            >('/admin/users', { params });

            return response.data.data;
        } catch {
            return createDefaultAdminUserList(params);
        }
    },

    // TODO(BACKEND): PATCH /admin/users/{userId}/status chua duoc trien khai.
    async updateUserStatus(
        userId: string,
        payload: UpdateAdminUserStatusRequest,
    ): Promise<UpdateAdminUserStatusResponse> {
        const response = await axiosClient.patch<
            ApiResponse<UpdateAdminUserStatusResponse>
        >(`/admin/users/${userId}/status`, payload);

        return response.data.data;
    },
};