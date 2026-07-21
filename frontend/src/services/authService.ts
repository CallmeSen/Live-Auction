import axiosClient from './axiosClient';
import type { ApiResponse } from '../interfaces/common';
import type {
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    LoginResponse,
    RegisterRequest,
    ResetPasswordRequest,
    ResetPasswordResponse,
    RegisterResponse,
} from '../interfaces/auth';

export const authService = {
    async login(
        payload: LoginRequest,
    ): Promise<LoginResponse> {
        const response = await axiosClient.post<
            ApiResponse<LoginResponse>
        >('/auth/login', payload);

        return response.data.data;
    },

    async register(
        payload: RegisterRequest,
    ): Promise<RegisterResponse> {
        const response = await axiosClient.post<
            ApiResponse<RegisterResponse>
        >('/auth/register', payload);

        return response.data.data;
    },

    // TODO(BACKEND): POST /auth/forgot-password chua duoc trien khai.
    async forgotPassword(
        payload: ForgotPasswordRequest,
    ): Promise<ForgotPasswordResponse> {
        const response = await axiosClient.post<
            ApiResponse<ForgotPasswordResponse>
        >('/auth/forgot-password', payload);

        return response.data.data;
    },

    // TODO(BACKEND): POST /auth/reset-password chua duoc trien khai.
    async resetPassword(
        payload: ResetPasswordRequest,
    ): Promise<ResetPasswordResponse> {
        const response = await axiosClient.post<
            ApiResponse<ResetPasswordResponse>
        >('/auth/reset-password', payload);

        return response.data.data;
    },
};