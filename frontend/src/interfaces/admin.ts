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

export interface AdminUserListRequest {
  page?: number;
  size?: number;
  status?: AuthUserStatus;
  keyword?: string;
}

export interface AdminUserListItemResponse {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  role: AuthUserRole;
  status: AuthUserStatus;
  createdAt: string;
}

export interface AdminUserListResponse {
  items: AdminUserListItemResponse[];
  page: number;
  size: number;
  total: number;
}

export interface UpdateAdminUserStatusRequest {
  status: AuthUserStatus;
}

export type UpdateAdminUserStatusResponse =
  AdminUserListItemResponse;
