import axiosClient from './axiosClient';
import type { ApiResponse } from './types';
import type {
    AuthUserRole,
    AuthUserStatus,
} from './authService';

export interface CreateAdminUserRequest {
    email: string;
    password: string;
    fullName: string;
    phone: string;
}

export interface CreateAdminUserResponse {
    id: string;
    email: string;
    fullName: string;
    phone: string;
    role: AuthUserRole;
    status: AuthUserStatus;
    createdAt: string;
}

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