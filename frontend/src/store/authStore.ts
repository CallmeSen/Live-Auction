import type { AuthUser, DemoAccount, RegisterForm, UserRole } from '../features/auth/types';

const TOKEN_KEY = 'accessToken';
const USER_KEY = 'demoAuthUser';
const REGISTERED_KEY = 'demoRegisteredUsers';
const PROFILE_OVERRIDES_KEY = 'demoProfileOverrides';
export const AUTH_CHANGED_EVENT = 'live-auction-auth-changed';

export const demoAccounts: DemoAccount[] = [
  {
    id: 'user-demo-01',
    email: 'user1@gmail.com',
    password: '123456',
    fullName: 'Nguyễn Minh User',
    role: 'USER',
    phone: '0901 111 111',
    address: 'Quận 7, TP. Hồ Chí Minh',
    status: 'ACTIVE',
    label: 'Thành viên 1',
    description: 'Đặt giá, đăng vật phẩm, quản lý phiên và ví',
  },
  {
    id: 'user-demo-02',
    email: 'sell1@gmail.com',
    password: '123456',
    fullName: 'Trần Gia User',
    role: 'USER',
    phone: '0902 222 222',
    address: 'Quận 3, TP. Hồ Chí Minh',
    status: 'ACTIVE',
    label: 'Thành viên 2',
    description: 'Dùng để thử vai trò chủ phiên và đặt giá phiên khác',
  },
  {
    id: 'admin-demo-01',
    email: 'admin@gmail.com',
    password: '123456',
    fullName: 'Quản trị viên',
    role: 'ADMIN',
    phone: '0903 333 333',
    address: 'Quận 1, TP. Hồ Chí Minh',
    status: 'ACTIVE',
    label: 'Admin',
    description: 'Quản lý người dùng, phiên đấu giá và danh mục',
  },
];

const emitAuthChanged = () => window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
type ProfileUpdate = {
  fullName: string;
  phone: string;
  address: string;
};

const getProfileOverrides = (): Record<string, ProfileUpdate> => {
  try {
    return JSON.parse(
      localStorage.getItem(PROFILE_OVERRIDES_KEY) ?? '{}',
    ) as Record<string, ProfileUpdate>;
  } catch {
    return {};
  }
};

const applyProfileOverride = (user: AuthUser): AuthUser => {
  const profile = getProfileOverrides()[user.id];

  return profile ? { ...user, ...profile } : user;
};

const withoutPassword = ({ password: _password, label: _label, description: _description, ...user }: DemoAccount): AuthUser => user;

const normalizeRole = (role: string): UserRole => role === 'ADMIN' ? 'ADMIN' : 'USER';

const normalizeAccount = (account: DemoAccount): DemoAccount => ({
  ...account,
  role: normalizeRole(account.role),
  label: account.role === 'ADMIN' ? 'Admin' : account.label.replace('Bidder', 'Thành viên').replace('Seller', 'Thành viên'),
});

const getRegisteredAccounts = (): DemoAccount[] => {
  try {
    const accounts = JSON.parse(localStorage.getItem(REGISTERED_KEY) ?? '[]') as DemoAccount[];
    const normalized = accounts.map(normalizeAccount);
    localStorage.setItem(REGISTERED_KEY, JSON.stringify(normalized));
    return normalized;
  } catch {
    return [];
  }
};

export const persistAuthSession = (
  accessToken: string,
  user: {
    id: string;
    email: string;
    fullName: string;
    role: string;
    status?: string;
  },
): AuthUser => {
  const authUser: AuthUser = {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: normalizeRole(user.role),
    phone: '',
    status: user.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
  };

  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(USER_KEY, JSON.stringify(authUser));
  emitAuthChanged();

  return authUser;
};

export const loginDemo = (email: string, password: string): AuthUser | null => {
  const normalizedEmail = email.trim().toLowerCase();
  const account = [...demoAccounts, ...getRegisteredAccounts()].find(
    (item) => item.email.toLowerCase() === normalizedEmail && item.password === password,
  );
  if (!account || account.status !== 'ACTIVE') return null;
  const user = applyProfileOverride(withoutPassword(account));
  localStorage.setItem(TOKEN_KEY, `demo-${user.role.toLowerCase()}-token`);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  emitAuthChanged();
  return user;
};

export const registerDemo = (form: RegisterForm): { success: boolean; message: string } => {
  const normalizedEmail = form.email.trim().toLowerCase();
  const accounts = [...demoAccounts, ...getRegisteredAccounts()];
  if (accounts.some((item) => item.email.toLowerCase() === normalizedEmail)) {
    return { success: false, message: 'Email này đã được sử dụng.' };
  }
  const newAccount: DemoAccount = {
    id: `registered-${Date.now()}`,
    email: normalizedEmail,
    password: form.password,
    fullName: form.fullName.trim(),
    role: 'USER',
    phone: '',
    address: '',
    status: 'ACTIVE',
    label: 'Thành viên',
    description: 'Có thể đặt giá và gửi vật phẩm để Admin duyệt',
  };
  localStorage.setItem(REGISTERED_KEY, JSON.stringify([...getRegisteredAccounts(), newAccount]));
  return { success: true, message: 'Đăng ký thành công. Bạn có thể đăng nhập ngay.' };
};

export const getCurrentUser = (): AuthUser | null => {
  try {
    const stored = JSON.parse(localStorage.getItem(USER_KEY) ?? 'null') as (AuthUser & { role: string }) | null;
    if (!stored) return null;
    const user: AuthUser = applyProfileOverride({ ...stored, role: normalizeRole(stored.role), });
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
    address: profile.address.trim(),
  };

  const updatedUser: AuthUser = {
    ...currentUser,
    ...normalizedProfile,
  };

  const profileOverrides = getProfileOverrides();

  localStorage.setItem(
    PROFILE_OVERRIDES_KEY,
    JSON.stringify({
      ...profileOverrides,
      [updatedUser.id]: normalizedProfile,
    }),
  );

  const registeredAccounts = getRegisteredAccounts().map((account) =>
    account.id === updatedUser.id
      ? { ...account, ...normalizedProfile }
      : account,
  );

  localStorage.setItem(
    REGISTERED_KEY,
    JSON.stringify(registeredAccounts),
  );

  localStorage.setItem(USER_KEY, JSON.stringify(updatedUser));
  emitAuthChanged();

  return updatedUser;
};

export const isAuthenticated = () => Boolean(localStorage.getItem(TOKEN_KEY) && getCurrentUser());

export const logoutDemo = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
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
