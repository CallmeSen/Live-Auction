import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CognitoAuthAdapter, AuthSession } from './types';

const defaultAdapter = vi.hoisted(() => ({
  signIn: vi.fn(),
  restore: vi.fn(),
  idToken: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('./cognito', () => ({
  cognitoAuthAdapter: defaultAdapter,
}));

import { AuthProvider } from './AuthProvider';
import LoginPage from '../features/auth/pages/LoginPage';
import useAuth from '../hooks/useAuth';

const userSession: AuthSession = {
  sub: 'user-1',
  email: 'user@example.test',
  role: 'USER',
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

function createAdapter(
  overrides: Partial<CognitoAuthAdapter> = {},
): CognitoAuthAdapter {
  return {
    signIn: vi.fn().mockResolvedValue(userSession),
    restore: vi.fn().mockResolvedValue(null),
    idToken: vi.fn().mockResolvedValue('id-token'),
    signOut: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function AuthProbe() {
  const auth = useAuth();

  return (
    <div>
      <span data-testid="status">{auth.status}</span>
      <span data-testid="session">
        {auth.session ? `${auth.session.email}:${auth.session.role}` : 'none'}
      </span>
      <button
        type="button"
        onClick={() => void auth.login('user@example.test', 'secret-value').catch(() => {
          document.body.dataset.authError = 'login-failed';
        })}
      >
        Login
      </button>
      <button type="button" onClick={() => void auth.logout()}>
        Logout
      </button>
      <button
        type="button"
        onClick={() => void auth.getIdToken().then((token) => {
          document.body.dataset.idToken = token;
        })}
      >
        Token
      </button>
    </div>
  );
}

function renderProbe(adapter: CognitoAuthAdapter) {
  return render(
    <AuthProvider adapter={adapter}>
      <AuthProbe />
    </AuthProvider>,
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    delete document.body.dataset.idToken;
    delete document.body.dataset.authError;
  });

  it('starts loading and restores an authenticated session on mount', async () => {
    const restoration = deferred<AuthSession | null>();
    const adapter = createAdapter({ restore: vi.fn(() => restoration.promise) });

    renderProbe(adapter);

    expect(screen.getByTestId('status')).toHaveTextContent('loading');
    expect(adapter.restore).toHaveBeenCalledOnce();

    restoration.resolve(userSession);

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('authenticated');
    });
    expect(screen.getByTestId('session')).toHaveTextContent(
      'user@example.test:USER',
    );
  });

  it('becomes anonymous when restore returns no session or fails', async () => {
    const noSessionAdapter = createAdapter();
    const firstRender = renderProbe(noSessionAdapter);

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('anonymous');
    });

    firstRender.unmount();
    const failedAdapter = createAdapter({
      restore: vi.fn().mockRejectedValue(new Error('restore failed')),
    });
    renderProbe(failedAdapter);

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('anonymous');
    });
  });

  it('logs in, logs out asynchronously, and delegates ID-token retrieval', async () => {
    const user = userEvent.setup();
    const signOut = deferred<void>();
    const adapter = createAdapter({
      signOut: vi.fn(() => signOut.promise),
    });
    renderProbe(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('anonymous');
    });

    await user.click(screen.getByRole('button', { name: 'Login' }));
    expect(adapter.signIn).toHaveBeenCalledWith(
      'user@example.test',
      'secret-value',
    );
    expect(screen.getByTestId('status')).toHaveTextContent('authenticated');

    await user.click(screen.getByRole('button', { name: 'Token' }));
    await waitFor(() => {
      expect(document.body.dataset.idToken).toBe('id-token');
    });
    expect(adapter.idToken).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'Logout' }));
    expect(screen.getByTestId('status')).toHaveTextContent('authenticated');

    signOut.resolve();
    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('anonymous');
    });
    expect(screen.getByTestId('session')).toHaveTextContent('none');
  });

  it('does not let a stale restore overwrite a newer login', async () => {
    const restoration = deferred<AuthSession | null>();
    const restoredUserSession: AuthSession = {
      sub: 'user-2',
      email: 'other-user@example.test',
      role: 'USER',
    };
    const adapter = createAdapter({
      restore: vi.fn(() => restoration.promise),
      signIn: vi.fn().mockResolvedValue(restoredUserSession),
    });
    renderProbe(adapter);

    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    await waitFor(() => {
      expect(screen.getByTestId('session')).toHaveTextContent(
        'other-user@example.test:USER',
      );
    });

    restoration.resolve(userSession);
    await act(async () => {
      await restoration.promise;
    });

    expect(screen.getByTestId('session')).toHaveTextContent(
      'other-user@example.test:USER',
    );
  });

  it('becomes anonymous when login fails before restore completes', async () => {
    const restoration = deferred<AuthSession | null>();
    const adapter = createAdapter({
      restore: vi.fn(() => restoration.promise),
      signIn: vi.fn().mockRejectedValue(new Error('Unable to sign in')),
    });
    renderProbe(adapter);

    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    await waitFor(() => {
      expect(document.body.dataset.authError).toBe('login-failed');
    });
    expect(screen.getByTestId('status')).toHaveTextContent('anonymous');
  });

  it('ignores restore completion after unmount', async () => {
    const restoration = deferred<AuthSession | null>();
    const adapter = createAdapter({ restore: vi.fn(() => restoration.promise) });
    const view = renderProbe(adapter);

    view.unmount();
    restoration.resolve(userSession);

    await expect(restoration.promise).resolves.toEqual(userSession);
  });
});

function renderLogin(
  adapter: CognitoAuthAdapter,
  state?: { from?: string },
) {
  return render(
    <AuthProvider adapter={adapter}>
      <MemoryRouter initialEntries={[{ pathname: '/login', state }]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<div data-testid="destination" />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

async function submitLogin(password = 'top-secret-password') {
  const user = userEvent.setup();
  await screen.findByLabelText('Email');
  await user.type(screen.getByLabelText('Email'), 'person@example.test');
  await user.type(screen.getByLabelText(/^Mật khẩu$/i), password);
  await user.click(screen.getByRole('button', { name: /login|ng nh/i }));
}

describe('LoginPage', () => {
  it.each([
    ['ADMIN', '/admin'],
    ['USER', '/auctions'],
  ] as const)('redirects restored %s sessions to %s without submitting', async (role, destination) => {
    const adapter = createAdapter({
      restore: vi.fn().mockResolvedValue({ ...userSession, role }),
    });

    render(
      <AuthProvider adapter={adapter}>
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path={destination} element={<div>{destination}</div>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(await screen.findByText(destination)).toBeInTheDocument();
    expect(adapter.signIn).not.toHaveBeenCalled();
  });

  it('returns a restored bidder to an allowed protected from location', async () => {
    const adapter = createAdapter({
      restore: vi.fn().mockResolvedValue(userSession),
    });

    render(
      <AuthProvider adapter={adapter}>
        <MemoryRouter initialEntries={[{
          pathname: '/login',
          state: { from: '/my-bids?filter=won' },
        }]}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/my-bids" element={<div>restored bid history</div>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(await screen.findByText('restored bid history')).toBeInTheDocument();
  });

  it('sends a restored user to role home when from is not allowed', async () => {
    const adapter = createAdapter({
      restore: vi.fn().mockResolvedValue(userSession),
    });

    render(
      <AuthProvider adapter={adapter}>
        <MemoryRouter initialEntries={[{
          pathname: '/login',
          state: { from: '/admin' },
        }]}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/auctions" element={<div>restored user home</div>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(await screen.findByText('restored user home')).toBeInTheDocument();
  });

  it('clears the password immediately and disables submission while pending', async () => {
    const signIn = deferred<AuthSession>();
    const adapter = createAdapter({ signIn: vi.fn(() => signIn.promise) });
    renderLogin(adapter);

    await submitLogin();

    expect(screen.getByLabelText(/^Mật khẩu$/i)).toHaveValue('');
    expect(document.body).not.toHaveTextContent('top-secret-password');
    expect(screen.getByRole('button', { name: /login|ng nh/i })).toBeDisabled();

    signIn.resolve(userSession);
    await screen.findByTestId('destination');
  });

  it('renders a sanitized error without exposing rejected credentials', async () => {
    const adapter = createAdapter({
      signIn: vi.fn().mockRejectedValue(
        new Error('Cognito rejected top-secret-password for an internal reason'),
      ),
    });
    renderLogin(adapter);

    await submitLogin();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /unable to sign in/i,
    );
    expect(document.body).not.toHaveTextContent('top-secret-password');
    expect(document.body).not.toHaveTextContent('internal reason');
  });

  it.each([
    ['ADMIN', '/admin'],
    ['USER', '/auctions'],
  ] as const)('redirects %s to %s', async (role, destination) => {
    const adapter = createAdapter({
      signIn: vi.fn().mockResolvedValue({ ...userSession, role }),
    });
    render(
      <AuthProvider adapter={adapter}>
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path={destination} element={<div>{destination}</div>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    await submitLogin('safe-password');

    expect(await screen.findByText(destination)).toBeInTheDocument();
  });

  it('returns a user to an allowed protected route but rejects an admin route', async () => {
    const validAdapter = createAdapter();
    const validView = render(
      <AuthProvider adapter={validAdapter}>
        <MemoryRouter initialEntries={[{ pathname: '/login', state: { from: '/my-bids?filter=won' } }]}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/my-bids" element={<div>bid history</div>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    await submitLogin('safe-password');
    expect(await screen.findByText('bid history')).toBeInTheDocument();

    validView.unmount();
    const invalidAdapter = createAdapter();
    render(
      <AuthProvider adapter={invalidAdapter}>
        <MemoryRouter initialEntries={[{ pathname: '/login', state: { from: '/admin' } }]}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/auctions" element={<div>user home</div>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    await submitLogin('safe-password');
    expect(await screen.findByText('user home')).toBeInTheDocument();
  });

  it('links registration and password reset flows', async () => {
    renderLogin(createAdapter());

    await screen.findByLabelText('Email');

    expect(screen.getByRole('link', { name: /create a new account/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /forgot password/i })).toBeInTheDocument();
  });
});
