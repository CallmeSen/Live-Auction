import { 
    UUID, 
    UserRole, 
    UserStatus 
} from '../type/type';

/**
 * POST /api/v1/auth/register
 */
export interface RegisterRequest {
  email: string;
  password: string;
  fullName: string;
  phone: string;
}

export interface RegisterUserData {
  id: UUID;
  email: string;
  fullName: string;
  phone: string;
  role: UserRole;
  status: UserStatus;
}

export interface RegisterResponse {
  status: number;
  code: number;
  message: string;
  data: RegisterUserData;
}

/**
 * POST /api/v1/auth/login
 */
export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginUserResponse {
  id: UUID;
  email: string;
  fullName: string;
  role: UserRole;
  status: UserStatus;
}

export interface LoginData {
  accessToken: string;
  tokenType: string;
  user: LoginUserResponse;
}

export interface LoginResponse {
  status: number;
  code: number;
  message: string;
  data: LoginData;
}