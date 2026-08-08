import { useCallback, useMemo } from 'react';
import { useAuthContext } from '../auth/AuthProvider';
import type { AuthUser } from '../features/auth/types';

export default function useAuth() {
  const auth = useAuthContext();
  const user = useMemo<AuthUser | null>(() => auth.session === null ? null : ({
    id: auth.session.sub,
    email: auth.session.email,
    fullName: auth.session.email,
    role: 'ADMIN',
    phone: '',
    status: 'ACTIVE',
    isPrimaryAdmin: false,
  }), [auth.session]);
  const updateProfile = useCallback(
    (profile: { fullName: string; phone: string }) => {
      void profile;
      return user;
    },
    [user],
  );

  return {
    user,
    session: auth.session,
    status: auth.status,
    authenticated: auth.status === 'authenticated',
    login: auth.login,
    completeNewPassword: auth.completeNewPassword,
    getIdToken: auth.getIdToken,
    updateProfile,
    logout: auth.logout,
  };
}
