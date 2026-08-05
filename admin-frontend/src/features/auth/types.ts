export type UserRole = 'USER' | 'ADMIN';
export type UserStatus = 'ACTIVE' | 'BANNED';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  phone: string;
  status: UserStatus;
  isPrimaryAdmin: boolean;
}

export interface LoginRequest { email: string; password: string; }
export interface RegisterRequest extends LoginRequest { fullName: string; phone: string; }
export type LoginForm = LoginRequest;
export type RegisterForm = RegisterRequest & { confirmPassword: string };
export type LoginFormState = LoginForm;
export type RegisterFormState = RegisterForm;
export type LoginUserData = Omit<AuthUser, 'phone'> & { phone?: string };
