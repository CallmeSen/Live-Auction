import { Amplify } from 'aws-amplify';
import {
  fetchAuthSession,
  getCurrentUser,
  signIn,
  signOut,
} from 'aws-amplify/auth';
import { runtimeConfig } from '../config/runtime';
import type { AuthRole, AuthSession, CognitoAuthAdapter } from './types';

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: runtimeConfig.userPoolId,
      userPoolClientId: runtimeConfig.userPoolClientId,
    },
  },
});

type IdToken = {
  payload: Record<string, unknown>;
  toString(): string;
};

type AuthDependencies = {
  signIn(input: { username: string; password: string }): Promise<{
    isSignedIn: boolean;
  }>;
  getCurrentUser(): Promise<unknown>;
  fetchAuthSession(): Promise<{
    tokens?: { idToken?: IdToken };
  }>;
  signOut(): Promise<void>;
};

const ROLE_PRIORITY: readonly AuthRole[] = ['ADMIN', 'SELLER', 'BIDDER'];
const INVALID_SESSION_MESSAGE = 'A valid authentication session is required';
const TOKEN_REFRESH_SKEW_SECONDS = 60;
const E2E_MOCK_AUTH_ENABLED = import.meta.env.VITE_E2E_MOCK_AUTH === 'true';
const E2E_SESSION_KEY = 'live-auction-e2e-session';

type CachedIdToken = {
  value: string;
  expiresAt: number;
};

function invalidSession(): Error {
  return new Error(INVALID_SESSION_MESSAGE);
}

function readIdentity(idToken: IdToken | undefined): {
  session: AuthSession;
  rawToken: string;
  expiresAt: number | null;
} {
  if (idToken === undefined || idToken.payload.token_use !== 'id') {
    throw invalidSession();
  }

  const { sub, email } = idToken.payload;
  const groups = idToken.payload['cognito:groups'];

  if (
    typeof sub !== 'string'
    || sub.trim() === ''
    || typeof email !== 'string'
    || email.trim() === ''
    || !Array.isArray(groups)
    || !groups.every((group) => typeof group === 'string')
  ) {
    throw invalidSession();
  }

  const role = ROLE_PRIORITY.find((candidate) => groups.includes(candidate));
  const rawToken = idToken.toString();

  if (role === undefined || rawToken === '') {
    throw invalidSession();
  }

  return {
    session: { sub, email, role },
    rawToken,
    expiresAt: typeof idToken.payload.exp === 'number'
      && Number.isInteger(idToken.payload.exp)
      ? idToken.payload.exp
      : null,
  };
}

export function createCognitoAuthAdapter(
  dependencies: AuthDependencies,
): CognitoAuthAdapter {
  let cachedIdToken: CachedIdToken | null = null;
  let identityGeneration = 0;

  async function currentIdentity(generation: number) {
    try {
      const session = await dependencies.fetchAuthSession();
      const identity = readIdentity(session.tokens?.idToken);
      if (generation === identityGeneration) {
        cachedIdToken = identity.expiresAt === null
          ? null
          : { value: identity.rawToken, expiresAt: identity.expiresAt };
      }
      return identity;
    } catch {
      if (generation === identityGeneration) cachedIdToken = null;
      throw invalidSession();
    }
  }

  function usableCachedIdToken(): string | null {
    if (
      cachedIdToken === null
      || cachedIdToken.expiresAt <= (Math.floor(Date.now() / 1_000) + TOKEN_REFRESH_SKEW_SECONDS)
    ) {
      return null;
    }
    return cachedIdToken.value;
  }

  return {
    async signIn(username, password) {
      const generation = ++identityGeneration;
      let result: { isSignedIn: boolean };

      try {
        result = await dependencies.signIn({ username, password });
      } catch {
        throw new Error('Unable to sign in');
      }

      if (!result.isSignedIn) {
        throw new Error('Sign-in could not be completed');
      }

      return (await currentIdentity(generation)).session;
    },

    async restore() {
      const generation = ++identityGeneration;
      try {
        await dependencies.getCurrentUser();
      } catch {
        if (generation === identityGeneration) cachedIdToken = null;
        return null;
      }

      return (await currentIdentity(generation)).session;
    },

    async idToken() {
      const cached = usableCachedIdToken();
      if (cached !== null) return cached;
      return (await currentIdentity(++identityGeneration)).rawToken;
    },

    async signOut() {
      const generation = ++identityGeneration;
      try {
        await dependencies.signOut();
      } catch {
        throw new Error('Unable to sign out');
      }
      if (generation === identityGeneration) cachedIdToken = null;
    },
  };
}

function createE2eMockAuthAdapter(): CognitoAuthAdapter {
  let activeSession: AuthSession | null = null;

  function readStoredSession(): AuthSession | null {
    try {
      const raw = window.sessionStorage.getItem(E2E_SESSION_KEY);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (
        typeof parsed !== 'object'
        || parsed === null
        || !('sub' in parsed)
        || !('email' in parsed)
        || !('role' in parsed)
        || typeof parsed.sub !== 'string'
        || typeof parsed.email !== 'string'
        || parsed.role !== 'BIDDER'
      ) return null;
      return { sub: parsed.sub, email: parsed.email, role: 'BIDDER' };
    } catch {
      return null;
    }
  }

  function storeSession(session: AuthSession | null): void {
    if (session === null) {
      window.sessionStorage.removeItem(E2E_SESSION_KEY);
      return;
    }
    window.sessionStorage.setItem(E2E_SESSION_KEY, JSON.stringify(session));
  }

  return {
    async signIn(username, password) {
      const email = username.trim().toLowerCase();
      if (!password || !email.endsWith('@example.test')) {
        throw new Error('Unable to sign in');
      }
      const localPart = email.slice(0, -'@example.test'.length);
      if (!/^[a-z0-9-]+$/.test(localPart)) {
        throw new Error('Unable to sign in');
      }
      activeSession = {
        sub: `e2e-${localPart}`,
        email,
        role: 'BIDDER',
      };
      storeSession(activeSession);
      return activeSession;
    },

    async restore() {
      activeSession = readStoredSession();
      return activeSession;
    },

    async idToken() {
      if (!activeSession) throw invalidSession();
      return `e2e-id-token-${activeSession.sub}`;
    },

    async signOut() {
      activeSession = null;
      storeSession(null);
    },
  };
}

export const cognitoAuthAdapter = E2E_MOCK_AUTH_ENABLED
  ? createE2eMockAuthAdapter()
  : createCognitoAuthAdapter({
    signIn,
    getCurrentUser,
    fetchAuthSession,
    signOut,
  });
