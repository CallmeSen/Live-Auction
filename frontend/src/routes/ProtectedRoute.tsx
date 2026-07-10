import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { isAuthenticated } from '../store/authStore';

export default function ProtectedRoute() {
  const location = useLocation();

  if (!isAuthenticated()) {
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