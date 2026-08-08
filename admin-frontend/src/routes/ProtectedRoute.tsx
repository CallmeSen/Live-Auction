import { Navigate, Outlet, useLocation } from 'react-router-dom';
import Loading from '../components/common/Loading';
import useAuth from '../hooks/useAuth';

export default function ProtectedRoute() {
  const location = useLocation();
  const { status } = useAuth();

  if (status === 'loading') return <Loading />;

  if (status !== 'authenticated') {
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
