import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { AuthRole } from '../../../auth/types';
import useAuth from '../../../hooks/useAuth';

const ROLE_HOME: Record<AuthRole, string> = {
  ADMIN: '/admin',
  SELLER: '/my-auctions',
  BIDDER: '/auctions',
};

export default function AccessDeniedPage() {
  const navigate = useNavigate();
  const { session, logout } = useAuth();
  const [switchingAccount, setSwitchingAccount] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const home = session ? ROLE_HOME[session.role] : '/auctions';

  const handleSwitchAccount = async () => {
    if (switchingAccount) return;

    setSwitchingAccount(true);
    setLogoutError('');

    try {
      await logout();
      navigate('/login', { replace: true });
    } catch {
      setLogoutError('Unable to sign out. Please try again.');
    } finally {
      setSwitchingAccount(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[65vh] max-w-2xl flex-col items-center justify-center px-6 text-center">
      <span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[var(--color-danger-solid)]">403 · Không có quyền</span>
      <h1 className="mt-4 font-display text-4xl">Tài khoản này không thể truy cập trang vừa chọn.</h1>
      <p className="mt-4 max-w-lg text-sm leading-6 text-[var(--color-text-muted)]">
        Giao diện demo đang mô phỏng quyền theo vai trò. Hãy quay về khu vực phù hợp hoặc đăng nhập bằng một tài khoản demo khác.
      </p>
      <div className="mt-7 flex gap-3">
        <Link to={home} className="rounded-md bg-[var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-[var(--color-bg)]">Về trang chính</Link>
        <button
          type="button"
          onClick={() => void handleSwitchAccount()}
          disabled={switchingAccount}
          className="rounded-md border border-[var(--color-border-strong)] px-5 py-2.5 text-sm text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Đổi tài khoản
        </button>
      </div>
      {logoutError && (
        <p role="alert" className="mt-4 text-xs text-[var(--color-danger)]">
          {logoutError}
        </p>
      )}
    </div>
  );
}
