import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { UserRole } from '../features/auth/types';
import { getCurrentUser, isAuthenticated } from '../store/authStore';

export default function RoleRoute({ allowedRoles }: { allowedRoles: UserRole[] }) {
  const location = useLocation();
  const user = getCurrentUser();

  if (!isAuthenticated() || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!allowedRoles.includes(user.role)) {
    return <Navigate to="/forbidden" replace />;
  }

  return <Outlet />;
}
