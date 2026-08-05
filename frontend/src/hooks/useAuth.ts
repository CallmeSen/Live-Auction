import { useCallback, useState } from 'react';
import { useAuthContext } from '../auth/AuthProvider';
import type { AuthUser } from '../features/auth/types';

type CompatibilityProfile = {
  sub: string;
  fullName: string;
  phone: string;
};

type ProfileUpdate = Pick<CompatibilityProfile, 'fullName' | 'phone'>;

export default function useAuth() {
  const auth = useAuthContext();
  const [profile, setProfile] = useState<CompatibilityProfile | null>(null);
  const session = auth.session;
  const activeProfile = session && profile?.sub === session.sub
    ? profile
    : session
      ? { sub: session.sub, fullName: session.email, phone: '' }
      : null;
  const user: AuthUser | null = session && activeProfile
    ? {
        id: session.sub,
        email: session.email,
        fullName: activeProfile.fullName,
        phone: activeProfile.phone,
        role: session.role === 'ADMIN' ? 'ADMIN' : 'USER',
        status: 'ACTIVE',
        isPrimaryAdmin: false,
      }
    : null;

  const updateProfile = useCallback((update: ProfileUpdate): AuthUser | null => {
    if (!session) return null;

    const nextProfile: CompatibilityProfile = {
      sub: session.sub,
      fullName: update.fullName.trim(),
      phone: update.phone.trim(),
    };
    setProfile(nextProfile);

    return {
      id: session.sub,
      email: session.email,
      fullName: nextProfile.fullName,
      phone: nextProfile.phone,
      role: session.role === 'ADMIN' ? 'ADMIN' : 'USER',
      status: 'ACTIVE',
      isPrimaryAdmin: false,
    };
  }, [session]);

  return {
    ...auth,
    user,
    authenticated: auth.status === 'authenticated',
    updateProfile,
  };
}
