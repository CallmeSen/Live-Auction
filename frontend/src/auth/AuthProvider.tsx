import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cognitoAuthAdapter } from './cognito';
import type { AuthSession, CognitoAuthAdapter } from './types';

export type AuthStatus = 'loading' | 'anonymous' | 'authenticated';

export type AuthContextValue = {
  status: AuthStatus;
  session: AuthSession | null;
  login(username: string, password: string): Promise<void>;
  logout(): Promise<void>;
  getIdToken(): Promise<string>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

type AuthProviderProps = {
  children: ReactNode;
  adapter?: CognitoAuthAdapter;
};

export function AuthProvider({
  children,
  adapter = cognitoAuthAdapter,
}: AuthProviderProps) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [session, setSession] = useState<AuthSession | null>(null);
  const mountedRef = useRef(false);
  const operationRef = useRef(0);

  const applySession = useCallback((nextSession: AuthSession | null) => {
    setSession(nextSession);
    setStatus(nextSession ? 'authenticated' : 'anonymous');
  }, []);

  const rejectNonUserSession = useCallback(
    async (operation: number, nextSession: AuthSession): Promise<boolean> => {
      if (nextSession.role === 'USER') {
        return false;
      }

      try {
        await adapter.signOut();
      } catch {
        // Keep the user-facing login result generic.
      }

      if (mountedRef.current && operationRef.current === operation) {
        applySession(null);
      }

      return true;
    },
    [adapter, applySession],
  );

  useEffect(() => {
    mountedRef.current = true;
    const operation = ++operationRef.current;

    void adapter.restore().then(
      (restoredSession) => {
        if (!mountedRef.current || operationRef.current !== operation) {
          return;
        }

        if (restoredSession === null) {
          applySession(null);
          return;
        }

        void rejectNonUserSession(operation, restoredSession).then((rejected) => {
          if (
            !rejected
            && mountedRef.current
            && operationRef.current === operation
          ) {
            applySession(restoredSession);
          }
        });
      },
      () => {
        if (mountedRef.current && operationRef.current === operation) {
          applySession(null);
        }
      },
    );

    return () => {
      mountedRef.current = false;
      operationRef.current += 1;
    };
  }, [adapter, applySession, rejectNonUserSession]);

  const login = useCallback(async (username: string, password: string) => {
    const operation = ++operationRef.current;
    let authenticatedSession: AuthSession;

    try {
      authenticatedSession = await adapter.signIn(username, password);
    } catch (error) {
      if (mountedRef.current && operationRef.current === operation) {
        setStatus((currentStatus) => (
          currentStatus === 'loading' ? 'anonymous' : currentStatus
        ));
      }
      throw error;
    }

    if (await rejectNonUserSession(operation, authenticatedSession)) {
      throw new Error('Unable to sign in');
    }

    if (mountedRef.current && operationRef.current === operation) {
      applySession(authenticatedSession);
    }
  }, [adapter, applySession, rejectNonUserSession]);

  const logout = useCallback(async () => {
    const operation = ++operationRef.current;
    await adapter.signOut();

    if (mountedRef.current && operationRef.current === operation) {
      applySession(null);
    }
  }, [adapter, applySession]);

  const getIdToken = useCallback(
    () => adapter.idToken(),
    [adapter],
  );

  const value = useMemo<AuthContextValue>(() => ({
    status,
    session,
    login,
    logout,
    getIdToken,
  }), [getIdToken, login, logout, session, status]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuthContext(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}
