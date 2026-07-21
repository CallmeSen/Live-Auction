export type UserRole = 'USER' | 'ADMIN';
export type UserStatus = 'ACTIVE' | 'BANNED';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  phone: string;
  status: UserStatus;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest extends LoginRequest {
  fullName: string;
  phone: string;
}

export interface LoginUserData {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  status: UserStatus;
  phone?: string;
}

export interface LoginResponseData {
  accessToken: string;
  tokenType: string;
  user: LoginUserData;
}

export interface RegisterResponseData {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  role: UserRole;
  status: UserStatus;
}

export type LoginForm = LoginRequest;

export type RegisterForm = RegisterRequest & {
  confirmPassword: string;
}
