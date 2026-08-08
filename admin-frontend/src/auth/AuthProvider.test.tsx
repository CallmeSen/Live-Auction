import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthSession, CognitoAuthAdapter } from './types';

const defaultAdapter = vi.hoisted(() => ({
  signIn: vi.fn(),
  completeNewPassword: vi.fn(),
  restore: vi.fn(),
  idToken: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('./cognito', () => ({
  cognitoAuthAdapter: defaultAdapter,
}));

import { AuthProvider } from './AuthProvider';
import { useAuthContext } from './AuthProvider';

const adminSession: AuthSession = {
  sub: 'admin-1',
  email: 'admin@example.test',
  role: 'ADMIN',
};

const userSession: AuthSession = {
  sub: 'user-1',
  email: 'user@example.test',
  role: 'USER',
};

function createAdapter(
  overrides: Partial<CognitoAuthAdapter> = {},
): CognitoAuthAdapter {
  return {
    signIn: vi.fn().mockResolvedValue(adminSession),
    completeNewPassword: vi.fn().mockResolvedValue(adminSession),
    restore: vi.fn().mockResolvedValue(null),
    idToken: vi.fn().mockResolvedValue('admin-id-token'),
    signOut: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function Probe() {
  const auth = useAuthContext();

  return (
    <div>
      <span data-testid="status">{auth.status}</span>
      <span data-testid="session">
        {auth.session ? `${auth.session.email}:${auth.session.role}` : 'none'}
      </span>
      <button
        type="button"
        onClick={() => void auth.login('admin@example.test', 'secret').catch(() => undefined)}
      >
        Login
      </button>
    </div>
  );
}

function renderProbe(adapter: CognitoAuthAdapter) {
  return render(
    <AuthProvider adapter={adapter}>
      <Probe />
    </AuthProvider>,
  );
}

describe('admin AuthProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('starts anonymous after an empty restore and does not read localStorage', async () => {
    const storageRead = vi.spyOn(Storage.prototype, 'getItem');
    const adapter = createAdapter();

    renderProbe(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('anonymous');
    });
    expect(screen.getByTestId('session')).toHaveTextContent('none');
    expect(adapter.restore).toHaveBeenCalledOnce();
    expect(storageRead).not.toHaveBeenCalled();
  });

  it('publishes an ADMIN session after Cognito sign-in', async () => {
    const adapter = createAdapter();
    renderProbe(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('anonymous');
    });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Login' }));

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('authenticated');
      expect(screen.getByTestId('session')).toHaveTextContent(
        'admin@example.test:ADMIN',
      );
    });
    expect(adapter.signIn).toHaveBeenCalledWith('admin@example.test', 'secret');
    expect(adapter.signOut).not.toHaveBeenCalled();
  });

  it('signs out a USER returned by sign-in before exposing an admin session', async () => {
    const adapter = createAdapter({
      signIn: vi.fn().mockResolvedValue(userSession),
    });
    renderProbe(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('anonymous');
    });
    await expect(
      userEvent.setup().click(screen.getByRole('button', { name: 'Login' })),
    ).resolves.toBeUndefined();

    await waitFor(() => {
      expect(adapter.signOut).toHaveBeenCalledOnce();
      expect(screen.getByTestId('status')).toHaveTextContent('anonymous');
      expect(screen.getByTestId('session')).toHaveTextContent('none');
    });
  });

  it('signs out a restored USER before exposing an admin session', async () => {
    const adapter = createAdapter({
      restore: vi.fn().mockResolvedValue(userSession),
    });
    renderProbe(adapter);

    await waitFor(() => {
      expect(adapter.signOut).toHaveBeenCalledOnce();
      expect(screen.getByTestId('status')).toHaveTextContent('anonymous');
      expect(screen.getByTestId('session')).toHaveTextContent('none');
    });
  });
});
