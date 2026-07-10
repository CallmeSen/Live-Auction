import axiosClient from './axiosClient';
import type { LoginForm, RegisterForm } from '../features/auth/types';

export interface AuthResponse {
  accessToken: string;
  user: { id: string; email: string; fullName: string; role: string };
}

export const authApi = {
  register: (payload: RegisterForm) => axiosClient.post('/auth/register', payload),
  login: (payload: LoginForm) => axiosClient.post<{ data: AuthResponse }>('/auth/login', payload),
  refresh: () => axiosClient.post<{ data: { accessToken: string } }>('/auth/refresh-token'),
  logout: () => axiosClient.post('/auth/logout'),
};
