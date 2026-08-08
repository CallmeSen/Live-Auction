import { describe, expect, it, vi } from 'vitest';

const validEnvironment = {
  MODE: 'test',
  VITE_AWS_REGION: 'ap-southeast-1',
  VITE_COGNITO_USER_POOL_ID: 'ap-southeast-1_example',
  VITE_COGNITO_CLIENT_ID: 'client-example',
  VITE_REST_API_URL: 'http://localhost:3000/prod',
  VITE_REST_API_KEY: 'quota-key',
  VITE_USER_APP_URL: 'http://localhost:5173',
};

for (const [name, value] of Object.entries(validEnvironment)) {
  vi.stubEnv(name, value);
}

const { createCognitoAuthAdapter } = await import('./cognito');

function idToken(
  groups: string[],
  value = 'admin-id-token',
  exp = Math.floor(Date.now() / 1_000) + 3_600,
) {
  return {
    payload: {
      token_use: 'id',
      sub: 'admin-1',
      email: 'admin@example.test',
      'cognito:groups': groups,
      exp,
    },
    toString: () => value,
  };
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    signIn: vi.fn().mockResolvedValue({ isSignedIn: true }),
    confirmSignIn: vi.fn().mockResolvedValue({ isSignedIn: true }),
    getCurrentUser: vi.fn().mockResolvedValue({}),
    fetchAuthSession: vi.fn().mockResolvedValue({
      tokens: { idToken: idToken(['ADMIN']) },
    }),
    signOut: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('admin Cognito adapter', () => {
  it('completes Cognito first-login temporary-password challenge', async () => {
    const confirmSignIn = vi.fn().mockResolvedValue({ isSignedIn: true });
    const deps = dependencies({
      signIn: vi.fn().mockResolvedValue({
        isSignedIn: false,
        nextStep: {
          signInStep: 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED',
        },
      }),
      confirmSignIn,
    });
    const adapter = createCognitoAuthAdapter(deps);

    await expect(adapter.signIn('admin@example.test', 'temporary-password'))
      .rejects.toMatchObject({ code: 'NEW_PASSWORD_REQUIRED' });
    await expect(adapter.completeNewPassword('permanent-password'))
      .resolves.toEqual({
        sub: 'admin-1',
        email: 'admin@example.test',
        role: 'ADMIN',
      });
    expect(confirmSignIn).toHaveBeenCalledWith({
      challengeResponse: 'permanent-password',
    });
  });

  it('accepts only an ADMIN ID token and exposes the token for API calls', async () => {
    const deps = dependencies();
    const adapter = createCognitoAuthAdapter(deps);

    await expect(adapter.signIn('admin@example.test', 'secret')).resolves.toEqual({
      sub: 'admin-1',
      email: 'admin@example.test',
      role: 'ADMIN',
    });
    await expect(adapter.idToken()).resolves.toBe('admin-id-token');
    expect(deps.signIn).toHaveBeenCalledWith({
      username: 'admin@example.test',
      password: 'secret',
    });
    expect(deps.fetchAuthSession).toHaveBeenCalledOnce();
  });

  it('returns a USER session for AuthProvider to sign out, but rejects malformed groups', async () => {
    const userDeps = dependencies({
      fetchAuthSession: vi.fn().mockResolvedValue({
        tokens: { idToken: idToken(['USER']) },
      }),
    });
    const userAdapter = createCognitoAuthAdapter(userDeps);
    await expect(userAdapter.signIn('user@example.test', 'secret')).resolves.toMatchObject({
      role: 'USER',
    });

    const malformedDeps = dependencies({
      fetchAuthSession: vi.fn().mockResolvedValue({
        tokens: { idToken: idToken([], '') },
      }),
    });
    const malformedAdapter = createCognitoAuthAdapter(malformedDeps);
    await expect(malformedAdapter.restore()).rejects.toThrow(
      'A valid authentication session is required',
    );
  });

  it('restores no session when Cognito has no current user', async () => {
    const deps = dependencies({
      getCurrentUser: vi.fn().mockRejectedValue(new Error('No current user')),
    });
    const adapter = createCognitoAuthAdapter(deps);

    await expect(adapter.restore()).resolves.toBeNull();
    expect(deps.fetchAuthSession).not.toHaveBeenCalled();
  });

  it('reuses a non-expired cached token for subsequent API calls', async () => {
    const fetchAuthSession = vi.fn().mockResolvedValue({
      tokens: { idToken: idToken(['ADMIN'], 'first-token') },
    });
    const adapter = createCognitoAuthAdapter(dependencies({ fetchAuthSession }));

    await adapter.signIn('admin@example.test', 'secret');
    await expect(adapter.idToken()).resolves.toBe('first-token');
    await expect(adapter.idToken()).resolves.toBe('first-token');
    expect(fetchAuthSession).toHaveBeenCalledOnce();
  });

  it('returns a generic error when Cognito sign-out fails', async () => {
    const adapter = createCognitoAuthAdapter(dependencies({
      signOut: vi.fn().mockRejectedValue(new Error('provider details')),
    }));

    await expect(adapter.signOut()).rejects.toThrow('Unable to sign out');
  });
});
