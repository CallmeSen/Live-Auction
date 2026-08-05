import type { AuthUserRole, AuthUserStatus } from './auth';
export interface CreateAdminUserRequest { email: string; password: string; fullName: string; phone: string; }
export interface CreateAdminUserResponse { id: string; email: string; fullName: string; phone: string; role: AuthUserRole; status: AuthUserStatus; isPrimaryAdmin: boolean; createdAt: string; }
export interface UpdateAdminUserStatusRequest { status: AuthUserStatus; }
export interface UpdateAdminUserStatusResponse { id: string; email: string; fullName: string; phone: string; role: AuthUserRole; status: AuthUserStatus; isPrimaryAdmin: boolean; updatedAt: string; }
export interface ResetAdminPasswordRequest { newPassword: string; }
export interface ResetAdminPasswordResponse { id: string; email: string; updatedAt: string; }
