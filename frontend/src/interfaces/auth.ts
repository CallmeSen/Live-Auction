export type AuthUserRole = 'USER' | 'ADMIN';
export type AuthUserStatus = 'ACTIVE' | 'BANNED';

export interface LoginRequest { email: string; password: string; }
export interface RegisterRequest { email: string; password: string; fullName: string; phone: string; }
export interface AuthUserResponse {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  role: AuthUserRole;
  status: AuthUserStatus;
  isPrimaryAdmin: boolean;
}
export interface LoginResponse { accessToken: string; tokenType: string; user: AuthUserResponse; }
export interface RegisterResponse { id: string; email: string; fullName: string; phone: string; role: AuthUserRole; status: AuthUserStatus; }
export interface ForgotPasswordRequest { email: string; }
export interface ForgotPasswordResponse { message: string; }
export interface ResetPasswordRequest { token: string; newPassword: string; }
export interface ResetPasswordResponse { message: string; }
