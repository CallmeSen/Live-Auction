import type {
  CreateAdminUserRequest,
  CreateAdminUserResponse,
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
};