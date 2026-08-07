import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { UserRole } from '../features/auth/types';
import Loading from '../components/common/Loading';
import useAuth from '../hooks/useAuth';

export default function RoleRoute({ allowedRoles }: { allowedRoles: UserRole[] }) {
  const location = useLocation();
  const { status, user } = useAuth();

  if (status === 'loading') return <Loading />;

  if (status !== 'authenticated' || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!allowedRoles.includes(user.role)) {
    return <Navigate to="/forbidden" replace />;
  }

  return <Outlet />;
}
