import { Navigate, Outlet } from 'react-router-dom';
import Logo from '../components/common/Logo';
import { getCurrentUser, isAuthenticated } from '../store/authStore';
export default function AuthLayout() {
  const user = getCurrentUser();
  if (isAuthenticated() && user?.role === 'ADMIN') return <Navigate to="/admin" replace />;
  return <main className="grid min-h-screen place-items-center bg-[var(--color-bg)] px-6 py-12">
    <div className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-xl">
      <div className="mb-8"><Logo /></div><Outlet />
    </div>
  </main>;
}
