import { useEffect, useState } from 'react';
import type { AuthUser } from '../features/auth/types';
import { AUTH_CHANGED_EVENT, getCurrentUser, logoutSession, updateCurrentUserProfile, } from '../store/authStore';

export default function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(() => getCurrentUser());

  useEffect(() => {
    const sync = () => setUser(getCurrentUser());
    window.addEventListener(AUTH_CHANGED_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  const logout = () => {
    logoutSession();
    setUser(null);
  };
  return {
    user,
    authenticated: Boolean(user),
    updateProfile: updateCurrentUserProfile,
    logout,
  };
}
