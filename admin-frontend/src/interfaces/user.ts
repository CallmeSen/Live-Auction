import type { AuthUserRole, AuthUserStatus } from './auth';

export type UserSortBy = 'createdAt' | 'email' | 'fullName';
export type SortOrder = 'asc' | 'desc';

export interface UserListRequest {
  page?: number;
  pageSize?: number;
  keyword?: string;
  role?: AuthUserRole;
  status?: AuthUserStatus;
  sortBy?: UserSortBy;
  sortOrder?: SortOrder;
}

export interface UserListItemResponse {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  role: AuthUserRole;
  status: AuthUserStatus;
  isPrimaryAdmin: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserListPaginationResponse {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface UserListResponse {
  items: UserListItemResponse[];
  pagination: UserListPaginationResponse;
}

export interface UserProfileResponse {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  role: AuthUserRole;
  status: AuthUserStatus;
  isPrimaryAdmin: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateUserProfileRequest {
  fullName: string;
  phone: string;
}
