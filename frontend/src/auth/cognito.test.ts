import { afterAll, describe, expect, it, vi } from 'vitest';
import cognitoSource from './cognito.ts?raw';

const amplifyMocks = vi.hoisted(() => ({
  configurationCalls: [] as unknown[],
  confirmResetPassword: vi.fn(),
  confirmSignUp: vi.fn(),
  fetchAuthSession: vi.fn(),
  getCurrentUser: vi.fn(),
  resetPassword: vi.fn(),
  signUp: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('aws-amplify', () => ({
  Amplify: {
    configure: (configuration: unknown) => {
      amplifyMocks.configurationCalls.push(configuration);
    },
  },
}));

vi.mock('aws-amplify/auth', () => ({
  confirmResetPassword: amplifyMocks.confirmResetPassword,
  confirmSignUp: amplifyMocks.confirmSignUp,
  fetchAuthSession: amplifyMocks.fetchAuthSession,
  getCurrentUser: amplifyMocks.getCurrentUser,
  resetPassword: amplifyMocks.resetPassword,
  signUp: amplifyMocks.signUp,
  signIn: amplifyMocks.signIn,
  signOut: amplifyMocks.signOut,
}));

const validEnvironment = {
  MODE: 'test',
  VITE_AWS_REGION: 'ap-southeast-1',
  VITE_COGNITO_USER_POOL_ID: 'ap-southeast-1_example',
  VITE_COGNITO_CLIENT_ID: 'client-example',
  VITE_REST_API_URL: 'https://rest.example.test/prod',
  VITE_REST_API_KEY: 'quota-key',
  VITE_WS_URL: 'wss://ws.example.test/prod',
};

for (const [name, value] of Object.entries(validEnvironment)) {
  vi.stubEnv(name, value);
}

const { cognitoAuthAdapter, createCognitoAuthAdapter } = await import('./cognito');

afterAll(() => vi.unstubAllEnvs());

type TokenPayload = Record<string, unknown>;

function createIdToken(
  payload: TokenPayload = {
    token_use: 'id',
    sub: 'user-123',
    email: 'bidder@example.test',
    'cognito:groups': ['USER'],
  },
) {
  return {
    payload,
    toString: () => 'header.payload.signature',
  };
}

function createDependencies(payload?: TokenPayload) {
  return {
    signIn: vi.fn().mockResolvedValue({
      isSignedIn: true,
      nextStep: { signInStep: 'DONE' },
    }),
    getCurrentUser: vi.fn().mockResolvedValue({ username: 'user-123' }),
    fetchAuthSession: vi.fn().mockResolvedValue({
      tokens: { idToken: createIdToken(payload) },
    }),
    signOut: vi.fn().mockResolvedValue(undefined),
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

describe('Cognito auth adapter', () => {
  it('configures Amplify once from runtimeConfig', () => {
    expect(amplifyMocks.configurationCalls).toEqual([{
      Auth: {
        Cognito: {
          userPoolId: validEnvironment.VITE_COGNITO_USER_POOL_ID,
          userPoolClientId: validEnvironment.VITE_COGNITO_CLIENT_ID,
        },
      },
    }]);
    expect(cognitoAuthAdapter).toBeDefined();
  });

  it.each([
    [['USER'], 'USER'],
    [['USER', 'ADMIN'], 'ADMIN'],
  ] as const)('maps %j with role priority to %s', async (groups, role) => {
    const dependencies = createDependencies({
      token_use: 'id',
      sub: 'user-123',
      email: 'member@example.test',
      'cognito:groups': groups,
    });
    const adapter = createCognitoAuthAdapter(dependencies);

    await expect(adapter.signIn('member@example.test', 'not-logged')).resolves.toEqual({
      sub: 'user-123',
      email: 'member@example.test',
      role,
    });
    expect(dependencies.signIn).toHaveBeenCalledWith({
      username: 'member@example.test',
      password: 'not-logged',
    });
  });

  it('maps the USER Cognito group to the USER application role', async () => {
    const dependencies = createDependencies({
      token_use: 'id',
      sub: 'user-123',
      email: 'member@example.test',
      'cognito:groups': ['USER'],
    });

    await expect(
      createCognitoAuthAdapter(dependencies).signIn(
        'member@example.test',
        'not-logged',
      ),
    ).resolves.toEqual({
      sub: 'user-123',
      email: 'member@example.test',
      role: 'USER',
    });
  });

  it('rejects an incomplete sign-in', async () => {
    const dependencies = createDependencies();
    dependencies.signIn.mockResolvedValue({
      isSignedIn: false,
      nextStep: { signInStep: 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED' },
    });

    await expect(
      createCognitoAuthAdapter(dependencies).signIn('member@example.test', 'secret'),
    ).rejects.toThrow('Sign-in could not be completed');
    expect(dependencies.fetchAuthSession).not.toHaveBeenCalled();
  });

  it('restores a current session', async () => {
    const dependencies = createDependencies();

    await expect(createCognitoAuthAdapter(dependencies).restore()).resolves.toEqual({
      sub: 'user-123',
      email: 'bidder@example.test',
      role: 'USER',
    });
    expect(dependencies.getCurrentUser).toHaveBeenCalledOnce();
  });

  it('returns null when there is no current user', async () => {
    const dependencies = createDependencies();
    dependencies.getCurrentUser.mockRejectedValue(new Error('not authenticated'));

    await expect(createCognitoAuthAdapter(dependencies).restore()).resolves.toBeNull();
    expect(dependencies.fetchAuthSession).not.toHaveBeenCalled();
  });

  it('rejects an absent ID token', async () => {
    const dependencies = createDependencies();
    dependencies.fetchAuthSession.mockResolvedValue({ tokens: undefined });

    await expect(createCognitoAuthAdapter(dependencies).idToken()).rejects.toThrow(
      'A valid authentication session is required',
    );
  });

  it('rejects a non-ID token', async () => {
    const dependencies = createDependencies({
      token_use: 'access',
      sub: 'user-123',
      email: 'bidder@example.test',
      'cognito:groups': ['USER'],
    });

    await expect(createCognitoAuthAdapter(dependencies).idToken()).rejects.toThrow(
      'A valid authentication session is required',
    );
  });

  it.each([
    ['sub', { email: 'bidder@example.test' }],
    ['email', { sub: 'user-123' }],
  ])('rejects a token missing %s', async (_claim, identityClaims) => {
    const dependencies = createDependencies({
      token_use: 'id',
      ...identityClaims,
      'cognito:groups': ['USER'],
    });

    await expect(createCognitoAuthAdapter(dependencies).restore()).rejects.toThrow(
      'A valid authentication session is required',
    );
  });

  it.each([
    'USER',
    ['USER', 1],
    [],
    ['AUDITOR'],
  ])('rejects malformed or unsupported groups: %j', async (groups) => {
    const dependencies = createDependencies({
      token_use: 'id',
      sub: 'user-123',
      email: 'bidder@example.test',
      'cognito:groups': groups,
    });

    await expect(createCognitoAuthAdapter(dependencies).restore()).rejects.toThrow(
      'A valid authentication session is required',
    );
  });

  it('returns the validated raw ID token on demand', async () => {
    const dependencies = createDependencies();

    await expect(createCognitoAuthAdapter(dependencies).idToken()).resolves.toBe(
      'header.payload.signature',
    );
  });

  it('reuses the fresh sign-in token from memory without a second session lookup', async () => {
    const dependencies = createDependencies({
      token_use: 'id',
      sub: 'user-123',
      email: 'bidder@example.test',
      'cognito:groups': ['USER'],
      exp: Math.floor(Date.now() / 1_000) + 300,
    });
    const adapter = createCognitoAuthAdapter(dependencies);

    await adapter.signIn('bidder@example.test', 'not-logged');

    await expect(adapter.idToken()).resolves.toBe('header.payload.signature');
    expect(dependencies.fetchAuthSession).toHaveBeenCalledTimes(1);
  });

  it('keeps a fresh sign-in token when an earlier restore fails late', async () => {
    const pendingCurrentUser = deferred<unknown>();
    const dependencies = createDependencies({
      token_use: 'id',
      sub: 'user-123',
      email: 'bidder@example.test',
      'cognito:groups': ['USER'],
      exp: Math.floor(Date.now() / 1_000) + 300,
    });
    dependencies.getCurrentUser.mockImplementation(() => pendingCurrentUser.promise);
    const adapter = createCognitoAuthAdapter(dependencies);

    const restore = adapter.restore();
    await adapter.signIn('bidder@example.test', 'not-logged');
    pendingCurrentUser.reject(new Error('initial restore has no session'));
    await expect(restore).resolves.toBeNull();

    await expect(adapter.idToken()).resolves.toBe('header.payload.signature');
    expect(dependencies.fetchAuthSession).toHaveBeenCalledTimes(1);
  });

  it('delegates sign-out', async () => {
    const dependencies = createDependencies();

    await expect(createCognitoAuthAdapter(dependencies).signOut()).resolves.toBeUndefined();
    expect(dependencies.signOut).toHaveBeenCalledOnce();
  });

  it('sanitizes dependency errors without exposing credentials or tokens', async () => {
    const sensitiveMarker = 'raw-secret-marker';
    const dependencies = createDependencies();
    dependencies.signIn.mockRejectedValue(new Error(sensitiveMarker));

    const error = await createCognitoAuthAdapter(dependencies)
      .signIn('member@example.test', sensitiveMarker)
      .catch((reason: unknown) => reason);

    expect(error).toEqual(new Error('Unable to sign in'));
    expect(String(error)).not.toContain(sensitiveMarker);
  });

  it('does not add manual token persistence or token logging', () => {
    expect(cognitoSource).not.toMatch(/localStorage\s*\.\s*setItem/);
    expect(cognitoSource).not.toMatch(/console\s*\./);
    expect(cognitoSource).not.toMatch(
      /(?:log|warn|error)\s*\([^)]*(?:accessToken|idToken|rawToken)/i,
    );
  });
});
