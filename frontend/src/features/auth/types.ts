export type UserRole = 'USER' | 'ADMIN';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  phone: string;
  address?: string;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface DemoAccount extends AuthUser {
  password: string;
  label: string;
  description: string;
}

export interface LoginForm {
  email: string;
  password: string;
}

export interface RegisterForm extends LoginForm {
  fullName: string;
}
