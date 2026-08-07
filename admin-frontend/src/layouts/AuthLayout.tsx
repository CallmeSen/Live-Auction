import { Navigate, Outlet } from 'react-router-dom';
import Logo from '../components/common/Logo';
import Loading from '../components/common/Loading';
import useAuth from '../hooks/useAuth';
export default function AuthLayout() {
  const { status } = useAuth();
  if (status === 'loading') return <Loading />;
  if (status === 'authenticated') return <Navigate to="/admin" replace />;
  return <main className="grid min-h-screen place-items-center bg-[var(--color-bg)] px-6 py-12">
    <div className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-xl">
      <div className="mb-8"><Logo /></div><Outlet />
    </div>
  </main>;
}
