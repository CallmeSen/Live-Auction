import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  MemoryRouter,
  Outlet,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthRole, AuthSession } from '../auth/types';

const authState = vi.hoisted(() => ({
  status: 'anonymous' as 'loading' | 'anonymous' | 'authenticated',
  session: null as AuthSession | null,
  login: vi.fn(),
  logout: vi.fn(),
  getIdToken: vi.fn(),
}));

const storageValues = new Map<string, string>();
const testStorage: Storage = {
  get length() {
    return storageValues.size;
  },
  clear: () => storageValues.clear(),
  getItem: (key) => storageValues.get(key) ?? null,
  key: (index) => [...storageValues.keys()][index] ?? null,
  removeItem: (key) => storageValues.delete(key),
  setItem: (key, value) => storageValues.set(key, String(value)),
};

vi.stubGlobal('localStorage', testStorage);

vi.mock('../hooks/useAuth', () => ({
  default: () => ({
    ...authState,
    authenticated: authState.status === 'authenticated',
    user: authState.session
      ? {
          id: authState.session.sub,
          email: authState.session.email,
          fullName: authState.session.email,
          phone: '',
          role: authState.session.role === 'ADMIN' ? 'ADMIN' : 'USER',
          status: 'ACTIVE',
        }
      : null,
    updateProfile: vi.fn(),
  }),
}));

vi.mock('../layouts/AuthLayout', () => ({ default: Outlet }));
vi.mock('../layouts/MainLayout', () => ({ default: Outlet }));

vi.mock('../features/auth/pages/LoginPage', () => ({ default: () => <div>login</div> }));
vi.mock('../features/auth/pages/RegisterPage', () => ({ default: () => <div>register</div> }));
vi.mock('../features/auth/pages/ConfirmSignUpPage', () => ({ default: () => <div>confirm-signup</div> }));
vi.mock('../features/auth/pages/ForgotPasswordPage', () => ({ default: () => <div>forgot-password</div> }));
vi.mock('../features/auth/pages/ResetPasswordPage', () => ({ default: () => <div>reset-password</div> }));
vi.mock('../features/auth/pages/AccessDeniedPage', () => ({ default: () => <div>forbidden</div> }));
vi.mock('../features/auction/pages/AuctionListPage', () => ({ default: () => <div>auctions</div> }));
vi.mock('../features/auction/pages/AuctionDetailPage', () => ({ default: () => <div>room</div> }));
vi.mock('../features/auction/pages/CreateAuctionPage', () => ({ default: () => <div>create-auction</div> }));
vi.mock('../features/auction/pages/MyAuctionsPage', () => ({ default: () => <div>my-auctions</div> }));
vi.mock('../features/bid/pages/MyBidsPage', () => ({ default: () => <div>my-bids</div> }));
vi.mock('../features/user/pages/ProfilePage', () => ({ default: () => <div>profile</div> }));
vi.mock('../features/admin/pages/AdminDashboardPage', () => ({ default: () => <div>admin</div> }));
vi.mock('../features/admin/pages/AdminUsersPage', () => ({ default: () => <div>admin-users</div> }));
vi.mock('../features/admin/pages/AdminAuctionsPage', () => ({ default: () => <div>admin-auctions</div> }));
vi.mock('../features/admin/pages/AdminCategoriesPage', () => ({ default: () => <div>admin-categories</div> }));
vi.mock('../features/notifications/pages/NotificationsPage', () => ({ default: () => <div>notifications</div> }));
vi.mock('../features/auction/pages/AuctionSessionDetailPage', () => ({ default: () => <div>session-detail</div> }));
vi.mock('../features/auction/pages/AuctionItemEditorPage', () => ({ default: () => <div>item-editor</div> }));

import Navbar from '../components/layout/Navbar';
import AppRoutes from './AppRoutes';
import ProtectedRoute from './ProtectedRoute';
import RoleRoute from './RoleRoute';

function setAuth(role?: AuthRole) {
  if (role) {
    authState.status = 'authenticated';
    authState.session = {
      sub: `${role.toLowerCase()}-1`,
      email: `${role.toLowerCase()}@example.test`,
      role,
    };
    return;
  }

  authState.status = 'anonymous';
  authState.session = null;
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    localStorage.clear();
    setAuth();
  });

  it('renders a loading gate without redirecting while auth restores', () => {
    authState.status = 'loading';

    render(
      <MemoryRouter initialEntries={['/my-bids?filter=won']}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/my-bids" element={<div>protected content</div>} />
          </Route>
          <Route path="/login" element={<div>login page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('protected content')).not.toBeInTheDocument();
    expect(screen.queryByText('login page')).not.toBeInTheDocument();
  });

  it('uses context as truth and redirects anonymous users preserving from', () => {
    localStorage.setItem('accessToken', 'legacy-token');
    localStorage.setItem('authUser', JSON.stringify({
      id: 'legacy-user',
      email: 'legacy@example.test',
      fullName: 'Legacy User',
      role: 'USER',
      phone: '',
      status: 'ACTIVE',
    }));

    render(
      <MemoryRouter initialEntries={['/my-bids?filter=won']}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/my-bids" element={<div>protected content</div>} />
          </Route>
          <Route
            path="/login"
            element={<LocationState />}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('from')).toHaveTextContent('/my-bids?filter=won');
    expect(screen.queryByText('protected content')).not.toBeInTheDocument();
  });
});

function LocationState() {
  const location = useLocation();
  const state = location.state as { from?: string } | null;
  return <div data-testid="from">{state?.from ?? ''}</div>;
}

describe('RoleRoute', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('allows a role listed in AuthRole[]', () => {
    setAuth('USER');

    render(
      <MemoryRouter initialEntries={['/seller']}>
        <Routes>
        <Route element={<RoleRoute allowedRoles={['USER']} />}>
            <Route path="/seller" element={<div>seller content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('seller content')).toBeInTheDocument();
  });

  it('redirects an authenticated disallowed role to access denied', () => {
    setAuth('ADMIN');

    render(
      <MemoryRouter initialEntries={['/seller']}>
        <Routes>
        <Route element={<RoleRoute allowedRoles={['USER']} />}>
            <Route path="/seller" element={<div>seller content</div>} />
          </Route>
          <Route path="/forbidden" element={<div>access denied</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('access denied')).toBeInTheDocument();
  });
});

describe('App route role policy', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it.each([
    ['USER', '/my-bids', 'my-bids'],
    ['USER', '/auction-items/item-1', 'room'],
    ['USER', '/auctions/create', 'create-auction'],
    ['USER', '/my-auctions', 'my-auctions'],
    ['USER', '/auction-sessions/session-1/items/create', 'item-editor'],
    ['USER', '/auction-items/item-1/edit', 'item-editor'],
    ['ADMIN', '/admin', 'admin'],
    ['ADMIN', '/admin/users', 'admin-users'],
    ['ADMIN', '/admin/auctions', 'admin-auctions'],
    ['ADMIN', '/admin/categories', 'admin-categories'],
  ] as const)('allows %s to open %s', (role, route, marker) => {
    setAuth(role);

    render(
      <MemoryRouter initialEntries={[route]}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(screen.getByText(marker)).toBeInTheDocument();
  });

  it.each([
    ['ADMIN', '/my-bids'],
    ['ADMIN', '/my-auctions'],
    ['ADMIN', '/auctions/create'],
    ['USER', '/admin'],
  ] as const)('denies %s access to %s', (role, route) => {
    setAuth(role);

    render(
      <MemoryRouter initialEntries={[route]}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(screen.getByText('forbidden')).toBeInTheDocument();
  });
});

describe('Navbar auth behavior', () => {
  beforeEach(() => {
    localStorage.clear();
    authState.logout.mockReset();
  });

  it('shows context session email and role without a registration link', () => {
    setAuth('USER');

    render(
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>,
    );

    expect(screen.getByText('user@example.test')).toBeInTheDocument();
    expect(screen.getByText('USER')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /register|ng k/i })).not.toBeInTheDocument();
  });

  it('awaits logout before navigating and disables repeated logout', async () => {
    setAuth('USER');
    let finishLogout!: () => void;
    authState.logout.mockImplementation(() => new Promise<void>((resolve) => {
      finishLogout = resolve;
    }));
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/my-auctions']}>
        <Routes>
          <Route path="/my-auctions" element={<Navbar />} />
          <Route path="/auctions" element={<div>auction home</div>} />
        </Routes>
      </MemoryRouter>,
    );

    const logoutButton = screen.getAllByRole('button', { name: /logout|ng xu/i })[0];
    await user.click(logoutButton);

    expect(logoutButton).toBeDisabled();
    expect(screen.queryByText('auction home')).not.toBeInTheDocument();

    finishLogout();
    await waitFor(() => {
      expect(screen.getByText('auction home')).toBeInTheDocument();
    });
  });

  it('handles failed logout without navigating or exposing the rejection', async () => {
    setAuth('USER');
    authState.logout.mockRejectedValue(
      new Error('Cognito sign-out failed with sensitive-marker'),
    );
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/my-auctions']}>
        <Routes>
          <Route path="/my-auctions" element={<Navbar />} />
          <Route path="/auctions" element={<div>auction home</div>} />
        </Routes>
      </MemoryRouter>,
    );

    const logoutButton = screen.getAllByRole('button', { name: /logout|ng xu/i })[0];
    await user.click(logoutButton);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /unable to sign out/i,
    );
    expect(document.body).not.toHaveTextContent('sensitive-marker');
    expect(screen.queryByText('auction home')).not.toBeInTheDocument();
    expect(logoutButton).toBeEnabled();
  });

  it('does not offer registration to anonymous users', () => {
    setAuth();

    render(
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('link', { name: /register|ng k/i })).not.toBeInTheDocument();
  });
});
