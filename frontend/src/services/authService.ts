import axiosClient from './axiosClient';
import type { ApiResponse } from './types';

export type AuthUserRole = 'USER' | 'ADMIN';
export type AuthUserStatus = 'ACTIVE' | 'BANNED';

export interface LoginRequest {
    email: string;
    password: string;
}

export interface RegisterRequest {
    email: string;
    password: string;
    fullName: string;
    phone: string;
}

export interface LoginResponse {
    accessToken: string;
    tokenType: string;
    user: {
        id: string;
        email: string;
        fullName: string;
        phone?: string;
        role: AuthUserRole;
        status: AuthUserStatus;
    };
}

export interface RegisterResponse {
    id: string;
    email: string;
    fullName: string;
    phone: string;
    role: AuthUserRole;
    status: AuthUserStatus;
}

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