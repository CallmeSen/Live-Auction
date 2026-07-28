import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { AuthRole } from '../auth/types';
import useAuth from '../hooks/useAuth';

export default function RoleRoute({ allowedRoles }: { allowedRoles: AuthRole[] }) {
  const location = useLocation();
  const { status, session } = useAuth();

  if (status === 'loading') {
    return (
      <div role="status" aria-live="polite">
        Loading session...
      </div>
    );
  }

  if (status === 'anonymous' || !session) {
    const from = `${location.pathname}${location.search}`;
    return <Navigate to="/login" replace state={{ from }} />;
  }

  if (!allowedRoles.includes(session.role)) {
    return <Navigate to="/forbidden" replace />;
  }

  return <Outlet />;
}
