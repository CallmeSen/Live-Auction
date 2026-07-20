import axiosClient from './axiosClient';
import type { LoginForm, RegisterForm } from '../features/auth/types';

export interface ApiEnvelope<T> {
  status: number;
  code: number | string;
  message: string;
  data: T;
}

export interface LoginData {
  accessToken: string;
  tokenType: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: string;
    status: string;
  };
}

export const authApi = {
  register: (payload: RegisterForm) =>
    axiosClient.post<ApiEnvelope<unknown>>('/auth/register', payload),
  login: (payload: LoginForm) =>
    axiosClient.post<ApiEnvelope<LoginData>>('/auth/login', payload),
  refresh: () =>
    axiosClient.post<ApiEnvelope<{ accessToken: string }>>('/auth/refresh-token'),
  logout: () => axiosClient.post('/auth/logout'),
};
