import type { AuthUserRole, AuthUserStatus } from './auth';
export interface UserProfileResponse { id: string; email: string; fullName: string; phone: string; role: AuthUserRole; status: AuthUserStatus; createdAt: string; }
export interface UpdateUserProfileRequest { fullName: string; phone: string; }
