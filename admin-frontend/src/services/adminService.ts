import type { ApiResponse } from '../interfaces/common';
import type { CreateAdminUserRequest, CreateAdminUserResponse, ResetAdminPasswordRequest, ResetAdminPasswordResponse, UpdateAdminUserStatusRequest, UpdateAdminUserStatusResponse } from '../interfaces/admin';
import axiosClient from './axiosClient';
export const adminService = {
  async createAdminUser(payload: CreateAdminUserRequest): Promise<CreateAdminUserResponse> {
    const response = await axiosClient.post<ApiResponse<CreateAdminUserResponse>>('/admin/users', payload);
    return response.data.data;
  },
  async updateUserStatus(userId: string, payload: UpdateAdminUserStatusRequest): Promise<UpdateAdminUserStatusResponse> {
    const response = await axiosClient.patch<ApiResponse<UpdateAdminUserStatusResponse>>('/admin/users/' + userId + '/status', payload);
    return response.data.data;
  },
  async resetAdminPassword(userId: string, payload: ResetAdminPasswordRequest): Promise<ResetAdminPasswordResponse> {
    const response = await axiosClient.patch<ApiResponse<ResetAdminPasswordResponse>>('/admin/users/' + userId + '/password', payload);
    return response.data.data;
  },
};
