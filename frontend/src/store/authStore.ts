import type { AuthUser, DemoAccount, RegisterForm, UserRole } from '../features/auth/types';

const TOKEN_KEY = 'accessToken';
const USER_KEY = 'demoAuthUser';
const REGISTERED_KEY = 'demoRegisteredUsers';
export const AUTH_CHANGED_EVENT = 'live-auction-auth-changed';

export const demoAccounts: DemoAccount[] = [
  {
    id: 'bidder-demo-01',
    email: 'user1@gmail.com',
    password: '123456',
    fullName: 'Nguyễn Minh Bidder',
    role: 'BIDDER',
    phone: '0901 111 111',
    status: 'ACTIVE',
    label: 'Bidder',
    description: 'Đặt giá, xem lịch sử bid và quản lý ví',
  },
  {
    id: 'seller-demo-01',
    email: 'sell1@gmail.com',
    password: '123456',
    fullName: 'Trần Gia Seller',
    role: 'SELLER',
    phone: '0902 222 222',
    status: 'ACTIVE',
    label: 'Seller',
    description: 'Tạo và quản lý các phiên đấu giá',
  },
  {
    id: 'admin-demo-01',
    email: 'admin@gmail.com',
    password: '123456',
    fullName: 'Quản trị viên',
    role: 'ADMIN',
    phone: '0903 333 333',
    status: 'ACTIVE',
    label: 'Admin',
    description: 'Quản lý người dùng, phiên đấu giá và danh mục',
  },
];

const emitAuthChanged = () => window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));

const withoutPassword = ({ password: _password, label: _label, description: _description, ...user }: DemoAccount): AuthUser => user;

const getRegisteredAccounts = (): DemoAccount[] => {
  try {
    return JSON.parse(localStorage.getItem(REGISTERED_KEY) ?? '[]') as DemoAccount[];
  } catch {
    return [];
  }
};

export const loginDemo = (email: string, password: string): AuthUser | null => {
  const normalizedEmail = email.trim().toLowerCase();
  const account = [...demoAccounts, ...getRegisteredAccounts()].find(
    (item) => item.email.toLowerCase() === normalizedEmail && item.password === password,
  );
  if (!account || account.status !== 'ACTIVE') return null;
  const user = withoutPassword(account);
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
    role: 'BIDDER',
    phone: '',
    status: 'ACTIVE',
    label: 'Bidder',
    description: 'Tài khoản đăng ký trong phiên demo',
  };
  localStorage.setItem(REGISTERED_KEY, JSON.stringify([...getRegisteredAccounts(), newAccount]));
  return { success: true, message: 'Đăng ký thành công. Bạn có thể đăng nhập ngay.' };
};

export const getCurrentUser = (): AuthUser | null => {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) ?? 'null') as AuthUser | null;
  } catch {
    return null;
  }
};

export const isAuthenticated = () => Boolean(localStorage.getItem(TOKEN_KEY) && getCurrentUser());

export const logoutDemo = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  emitAuthChanged();
};

export const getRoleHome = (role?: UserRole) => {
  if (role === 'ADMIN') return '/admin';
  if (role === 'SELLER') return '/my-auctions';
  return '/auctions';
};

export const roleLabel: Record<UserRole, string> = {
  BIDDER: 'Người đấu giá',
  SELLER: 'Người bán',
  ADMIN: 'Quản trị viên',
};
