import type {
  AuthUser,
  LoginUserData,
  UserRole,
  UserStatus,
} from '../features/auth/types';

const TOKEN_KEY = 'accessToken';
const USER_KEY = 'authUser';
export const AUTH_CHANGED_EVENT = 'live-auction-auth-changed';

const emitAuthChanged = () => window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
type ProfileUpdate = {
  fullName: string;
  phone: string;
};

const normalizeRole = (role: string): UserRole => role === 'ADMIN' ? 'ADMIN' : 'USER';
const normalizeStatus = (status?: string): UserStatus =>
  status === 'BANNED' || status === 'INACTIVE' ? 'BANNED' : 'ACTIVE';

export const persistAuthSession = (
  accessToken: string,
  user: LoginUserData,
): AuthUser => {
  const authUser: AuthUser = {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: normalizeRole(user.role),
    phone: user.phone ?? '',
    status: normalizeStatus(user.status),
  };

  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(USER_KEY, JSON.stringify(authUser));
  emitAuthChanged();

  return authUser;
};

export const getCurrentUser = (): AuthUser | null => {
  try {
    const stored = JSON.parse(localStorage.getItem(USER_KEY) ?? 'null') as (AuthUser & { role: string; status: string }) | null;
    if (!stored) return null;
    const user: AuthUser = {
      ...stored,
      role: normalizeRole(stored.role),
      status: normalizeStatus(stored.status),
    };
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    return user;
  } catch {
    return null;
  }
};
export const updateCurrentUserProfile = (
  profile: ProfileUpdate,
): AuthUser | null => {
  const currentUser = getCurrentUser();

  if (!currentUser) return null;

  const normalizedProfile: ProfileUpdate = {
    fullName: profile.fullName.trim(),
    phone: profile.phone.trim(),
  };

  const updatedUser: AuthUser = {
    ...currentUser,
    ...normalizedProfile,
  };

  localStorage.setItem(USER_KEY, JSON.stringify(updatedUser));
  emitAuthChanged();

  return updatedUser;
};

export const isAuthenticated = () => Boolean(localStorage.getItem(TOKEN_KEY) && getCurrentUser());

export const logoutSession = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem('demoAuthUser');
  localStorage.removeItem('demoRegisteredUsers');
  localStorage.removeItem('profileOverrides');
  emitAuthChanged();
};

export const getRoleHome = (role?: UserRole) => {
  if (role === 'ADMIN') return '/admin';
  return '/auctions';
};

export const roleLabel: Record<UserRole, string> = {
  USER: 'Thành viên',
  ADMIN: 'Quản trị viên',
};
