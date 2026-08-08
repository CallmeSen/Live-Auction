import { Amplify } from 'aws-amplify';
import {
  confirmSignIn,
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
    nextStep?: { signInStep?: string };
  }>;
  confirmSignIn(input: { challengeResponse: string }): Promise<{
    isSignedIn: boolean;
    nextStep?: { signInStep?: string };
  }>;
  getCurrentUser(): Promise<unknown>;
  fetchAuthSession(): Promise<{ tokens?: { idToken?: IdToken } }>;
  signOut(): Promise<void>;
};

type SignInResult = Awaited<ReturnType<AuthDependencies['signIn']>>;

const INVALID_SESSION_MESSAGE = 'A valid authentication session is required';
const TOKEN_REFRESH_SKEW_SECONDS = 60;

export class NewPasswordRequiredError extends Error {
  readonly code = 'NEW_PASSWORD_REQUIRED';

  constructor() {
    super('A new password is required');
    this.name = 'NewPasswordRequiredError';
  }
}

type CachedIdToken = { value: string; expiresAt: number };

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
  const rawToken = idToken.toString();

  if (
    typeof sub !== 'string'
    || sub.trim() === ''
    || typeof email !== 'string'
    || email.trim() === ''
    || !Array.isArray(groups)
    || !groups.every((group) => typeof group === 'string')
    || rawToken === ''
  ) {
    throw invalidSession();
  }

  const role: AuthRole = groups.includes('ADMIN')
    ? 'ADMIN'
    : groups.includes('USER')
      ? 'USER'
      : (() => { throw invalidSession(); })();

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
  let newPasswordChallengePending = false;

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
      || cachedIdToken.expiresAt <= Math.floor(Date.now() / 1_000) + TOKEN_REFRESH_SKEW_SECONDS
    ) {
      return null;
    }
    return cachedIdToken.value;
  }

  return {
    async signIn(username, password) {
      const generation = ++identityGeneration;
      newPasswordChallengePending = false;
      let result: SignInResult;

      try {
        result = await dependencies.signIn({ username, password });
      } catch {
        throw new Error('Unable to sign in');
      }

      if (!result.isSignedIn) {
        if (result.nextStep?.signInStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
          newPasswordChallengePending = true;
          throw new NewPasswordRequiredError();
        }
        throw new Error('Sign-in could not be completed');
      }
      return (await currentIdentity(generation)).session;
    },

    async completeNewPassword(newPassword) {
      if (!newPasswordChallengePending) {
        throw new Error('No new-password challenge is pending');
      }

      let result: SignInResult;
      try {
        result = await dependencies.confirmSignIn({
          challengeResponse: newPassword,
        });
      } catch {
        throw new Error('Unable to set new password');
      }

      if (!result.isSignedIn) {
        throw new Error('New password could not be completed');
      }

      newPasswordChallengePending = false;
      return (await currentIdentity(identityGeneration)).session;
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
      newPasswordChallengePending = false;
      try {
        await dependencies.signOut();
      } catch {
        throw new Error('Unable to sign out');
      }
      if (generation === identityGeneration) cachedIdToken = null;
    },
  };
}

export const cognitoAuthAdapter = createCognitoAuthAdapter({
  confirmSignIn,
  signIn,
  getCurrentUser,
  fetchAuthSession,
  signOut,
});
