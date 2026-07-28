import type {
  AuthUserRole,
  AuthUserStatus,
} from './auth';

export interface CreateAdminUserRequest {
  email: string;
  password: string;
  fullName: string;
  phone: string;
}

export interface CreateAdminUserResponse {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  role: AuthUserRole;
  status: AuthUserStatus;
  createdAt: string;
}

export interface UpdateAdminUserStatusRequest {
  status: AuthUserStatus;
}

export interface UpdateAdminUserStatusResponse {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  role: AuthUserRole;
  status: AuthUserStatus;
  updatedAt: string;
}
