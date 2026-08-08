import { Navigate, Outlet, useLocation } from 'react-router-dom';
import useAuth from '../hooks/useAuth';

export default function ProtectedRoute() {
  const location = useLocation();
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--color-text-muted)]"
      >
        Loading session...
      </div>
    );
  }

  if (status === 'anonymous') {
    const from = `${location.pathname}${location.search}`;

    return (
      <Navigate
        to="/login"
        replace
        state={{ from }}
      />
    );
  }

  return <Outlet />;
}
