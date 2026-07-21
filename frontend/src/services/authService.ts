import axiosClient from './axiosClient';
import type { ApiResponse } from '../interfaces/common';
import type {
    LoginRequest,
    LoginResponse,
    RegisterRequest,
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
};