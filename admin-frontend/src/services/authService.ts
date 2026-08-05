import axiosClient from './axiosClient';
import type { ApiResponse } from '../interfaces/common';
import type {
  ForgotPasswordRequest,
  ForgotPasswordResponse,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegisterResponse,
  ResetPasswordRequest,
  ResetPasswordResponse,
} from '../interfaces/auth';

export const authService = {
  async login(payload: LoginRequest): Promise<LoginResponse> {
    const response = await axiosClient.post<ApiResponse<LoginResponse>>(
      '/auth/login',
      payload,
    );

    return response.data.data;
  },

  async register(payload: RegisterRequest): Promise<RegisterResponse> {
    const response = await axiosClient.post<ApiResponse<RegisterResponse>>(
      '/auth/register',
      payload,
    );

    return response.data.data;
  },

  async forgotPassword(
    payload: ForgotPasswordRequest,
  ): Promise<ForgotPasswordResponse> {
    const response = await axiosClient.post<ApiResponse<null>>(
      '/auth/forgot-password',
      payload,
    );

    return { message: response.data.message };
  },

  async resetPassword(
    payload: ResetPasswordRequest,
  ): Promise<ResetPasswordResponse> {
    const response = await axiosClient.post<ApiResponse<null>>(
      '/auth/reset-password',
      payload,
    );

    return { message: response.data.message };
  },
};