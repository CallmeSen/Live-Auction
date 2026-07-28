import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import accessDeniedSource from './AccessDeniedPage.tsx?raw';
import type { AuthRole } from '../../../auth/types';

const authState = vi.hoisted(() => ({
  role: 'BIDDER' as AuthRole,
  logout: vi.fn(),
}));

vi.mock('../../../hooks/useAuth', () => ({
  default: () => ({
    status: 'authenticated',
    session: {
      sub: `${authState.role.toLowerCase()}-1`,
      email: `${authState.role.toLowerCase()}@example.test`,
      role: authState.role,
    },
    logout: authState.logout,
  }),
}));

vi.mock('../../../store/authStore', () => ({
  getCurrentUser: () => ({ role: 'ADMIN' }),
  getRoleHome: () => '/legacy-auth-store-home',
}));

import AccessDeniedPage from './AccessDeniedPage';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function renderAccessDenied() {
  return render(
    <MemoryRouter initialEntries={['/forbidden']}>
      <Routes>
        <Route path="/forbidden" element={<AccessDeniedPage />} />
        <Route path="/login" element={<div>login page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AccessDeniedPage', () => {
  beforeEach(() => {
    authState.role = 'BIDDER';
    authState.logout.mockReset();
  });

  it.each([
    ['ADMIN', '/admin'],
    ['SELLER', '/my-auctions'],
    ['BIDDER', '/auctions'],
  ] as const)('uses the %s session for role-correct home navigation', (role, home) => {
    authState.role = role;
    renderAccessDenied();

    expect(screen.getByRole('link', { name: /về trang chính/i })).toHaveAttribute(
      'href',
      home,
    );
  });

  it('awaits logout before navigating to login to switch accounts', async () => {
    const signOut = deferred<void>();
    authState.logout.mockImplementation(() => signOut.promise);
    const user = userEvent.setup();
    renderAccessDenied();

    const switchButton = screen.getByRole('button', { name: /đổi tài khoản/i });
    await user.click(switchButton);

    expect(authState.logout).toHaveBeenCalledOnce();
    expect(screen.queryByText('login page')).not.toBeInTheDocument();
    expect(switchButton).toBeDisabled();

    signOut.resolve();
    await waitFor(() => {
      expect(screen.getByText('login page')).toBeInTheDocument();
    });
  });

  it('handles switch-account logout failure without exposing details', async () => {
    authState.logout.mockRejectedValue(
      new Error('Cognito rejected sensitive-access-marker'),
    );
    const user = userEvent.setup();
    renderAccessDenied();

    const switchButton = screen.getByRole('button', { name: /đổi tài khoản/i });
    await user.click(switchButton);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /unable to sign out/i,
    );
    expect(document.body).not.toHaveTextContent('sensitive-access-marker');
    expect(screen.queryByText('login page')).not.toBeInTheDocument();
    expect(switchButton).toBeEnabled();
  });

  it('does not import the legacy auth store', () => {
    expect(accessDeniedSource).not.toMatch(/authStore/);
  });
});
