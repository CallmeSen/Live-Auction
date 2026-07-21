export type AuthUserRole = 'USER' | 'ADMIN';

export type AuthUserStatus = 'ACTIVE' | 'BANNED';

export interface AuthUserResponse {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  role: AuthUserRole;
  status: AuthUserStatus;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  tokenType: string;
  user: AuthUserResponse;
}

export interface RegisterRequest {
  email: string;
  password: string;
  fullName: string;
  phone: string;
}

export interface RegisterResponse {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  role: AuthUserRole;
  status: AuthUserStatus;
}