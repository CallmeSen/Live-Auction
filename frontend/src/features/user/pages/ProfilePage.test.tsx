import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({
  logout: vi.fn(),
  updateProfile: vi.fn(),
}));

const userServiceMocks = vi.hoisted(() => ({
  getProfile: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock('../../../hooks/useAuth', () => ({
  default: () => ({
    status: 'authenticated',
    session: {
      sub: 'seller-1',
      email: 'seller@example.test',
      role: 'SELLER',
    },
    user: {
      id: 'seller-1',
      email: 'seller@example.test',
      fullName: 'Seller Profile',
      phone: '0123456789',
      role: 'USER',
      status: 'ACTIVE',
    },
    authenticated: true,
    login: vi.fn(),
    getIdToken: vi.fn(),
    logout: authState.logout,
    updateProfile: authState.updateProfile,
  }),
}));

vi.mock('../../../contexts/ThemeContext', () => ({
  useTheme: () => ({ isDark: true, toggleTheme: vi.fn() }),
}));

vi.mock('../../../services/userService', () => ({
  userService: userServiceMocks,
}));

import ProfilePage from './ProfilePage';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function renderProfile() {
  return render(
    <MemoryRouter initialEntries={['/profile']}>
      <Routes>
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/auctions" element={<div>auction home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProfilePage logout', () => {
  beforeEach(() => {
    authState.logout.mockReset();
    authState.updateProfile.mockReset();
    authState.updateProfile.mockImplementation((profile) => ({
      id: 'seller-1',
      email: 'seller@example.test',
      fullName: profile.fullName,
      phone: profile.phone,
      role: 'USER',
      status: 'ACTIVE',
    }));
    userServiceMocks.getProfile.mockReset();
    userServiceMocks.getProfile.mockResolvedValue({
      id: 'seller-1',
      email: 'seller@example.test',
      fullName: 'Seller Profile',
      phone: '0123456789',
      role: 'USER',
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00Z',
    });
    userServiceMocks.updateProfile.mockReset();
  });

  it('awaits Cognito logout before navigating from the direct logout button', async () => {
    const signOut = deferred<void>();
    authState.logout.mockImplementation(() => signOut.promise);
    const user = userEvent.setup();
    renderProfile();

    const logoutButton = screen.getByRole('button', { name: /ng xuất/i });
    await user.click(logoutButton);

    expect(authState.logout).toHaveBeenCalledOnce();
    expect(screen.queryByText('auction home')).not.toBeInTheDocument();
    expect(logoutButton).toBeDisabled();

    signOut.resolve();
    await waitFor(() => {
      expect(screen.getByText('auction home')).toBeInTheDocument();
    });
  });

  it('awaits Cognito logout after discarding unsaved profile changes', async () => {
    const signOut = deferred<void>();
    authState.logout.mockImplementation(() => signOut.promise);
    const user = userEvent.setup();
    renderProfile();

    await screen.findByDisplayValue('Seller Profile');
    await user.click(screen.getByRole('button', { name: /cập nhật thông tin/i }));
    const fullName = screen.getByLabelText(/họ và tên/i);
    await user.clear(fullName);
    await user.type(fullName, 'Changed Seller');
    await user.click(screen.getByRole('button', { name: /ng xuất/i }));
    await user.click(await screen.findByRole('button', { name: /giữ nguyên/i }));

    expect(authState.logout).toHaveBeenCalledOnce();
    expect(screen.queryByText('auction home')).not.toBeInTheDocument();

    signOut.resolve();
    await waitFor(() => {
      expect(screen.getByText('auction home')).toBeInTheDocument();
    });
  });

  it('shows a sanitized logout failure, stays put, and re-enables logout', async () => {
    authState.logout.mockRejectedValue(
      new Error('Cognito rejected sensitive-profile-marker'),
    );
    const user = userEvent.setup();
    renderProfile();

    const logoutButton = screen.getByRole('button', { name: /ng xuất/i });
    await user.click(logoutButton);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /unable to sign out/i,
    );
    expect(document.body).not.toHaveTextContent('sensitive-profile-marker');
    expect(screen.queryByText('auction home')).not.toBeInTheDocument();
    expect(logoutButton).toBeEnabled();
  });
});
