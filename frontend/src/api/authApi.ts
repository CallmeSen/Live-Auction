import axiosClient from './axiosClient';
import type { ApiEnvelope } from './types';
import type {
  LoginRequest,
  LoginResponseData,
  RegisterRequest,
  RegisterResponseData,
} from '../features/auth/types';

export const authApi = {
  register: (payload: RegisterRequest) =>
    axiosClient.post<ApiEnvelope<RegisterResponseData>>('/auth/register', payload),
  login: (payload: LoginRequest) =>
    axiosClient.post<ApiEnvelope<LoginResponseData>>('/auth/login', payload),
};
