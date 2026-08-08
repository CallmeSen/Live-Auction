import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import Logo from '../common/Logo';
import useAuth from '../../hooks/useAuth';

interface NavItem {
  label: string;
  to: string;
  auth?: boolean;
}

const navItems: NavItem[] = [
  { label: 'Khám phá', to: '/auctions' },
  { label: 'Đã đặt giá', to: '/my-bids', auth: true },
  { label: 'Phiên của tôi', to: '/my-auctions', auth: true },
];

export default function Navbar() {
  const navigate = useNavigate();
  const { session, user, logout } = useAuth();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');

  const visibleItems = navItems.filter((item) => !item.auth || session?.role === 'USER');

  const initials = user?.fullName
    ? user.fullName
        .split(' ')
        .filter(Boolean)
        .slice(-2)
        .map((part) => part[0])
        .join('')
        .toUpperCase()
    : session?.email.slice(0, 1).toUpperCase() ?? 'G';

  const handleLogout = async () => {
    if (loggingOut) return;

    setLoggingOut(true);
    setLogoutError('');

    try {
      await logout();
      setMobileOpen(false);
      navigate('/auctions', { replace: true });
    } catch {
      setLogoutError('Không thể đăng xuất. Vui lòng thử lại.');
    } finally {
      setLoggingOut(false);
    }
  };

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `text-sm font-medium transition-colors ${
      isActive
        ? 'text-[var(--color-primary)]'
        : 'text-[var(--color-text-soft)] hover:text-[var(--color-text)]'
    }`;

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-bg)]/95 backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-6">
        <Link to="/auctions" aria-label="Về trang chủ">
          <Logo />
        </Link>

        <nav
          className="hidden items-center gap-7 lg:flex"
          aria-label="Điều hướng chính"
        >
          {visibleItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={navClass}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          {session?.role === 'USER' && (
            <Link
              to="/auctions/create"
              className="hidden rounded-md bg-[var(--color-primary)] px-3.5 py-2 text-xs font-semibold text-[var(--color-bg)] transition hover:bg-[var(--color-primary-hover)] sm:block"
            >
              ＋ Tạo phiên
            </Link>
          )}

          {session ? (
            <>
              <div className="hidden text-right sm:block">
                <p className="max-w-32 truncate text-xs text-[var(--color-text)]">
                  {user?.fullName || session.email}
                </p>

                <p className="mt-0.5 text-[10px] text-[var(--color-primary)]">
                  Thành viên
                </p>
              </div>

              <Link
                to="/profile"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface-alt)] text-xs font-semibold text-[var(--color-primary)] transition hover:border-[var(--color-primary)]"
                aria-label="Hồ sơ"
              >
                {initials}
              </Link>

              <button
                type="button"
                onClick={() => void handleLogout()}
                disabled={loggingOut}
                className="hidden rounded-md border border-[var(--color-danger-border)] px-3 py-2 text-xs font-medium text-[var(--color-danger)] transition hover:border-[var(--color-danger)] hover:bg-[var(--color-danger-border)]/15 disabled:cursor-not-allowed disabled:opacity-60 sm:inline-flex"
              >
                {loggingOut ? 'Đang đăng xuất...' : 'Đăng xuất'}
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="rounded-md border border-[var(--color-primary)] px-3 py-2 text-xs font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10"
              >
                Đăng nhập
              </Link>

              <Link
                to="/register"
                className="hidden rounded-md bg-[var(--color-primary)] px-3 py-2 text-xs font-semibold text-[var(--color-bg)] sm:inline-flex"
              >
                Đăng ký
              </Link>
            </>
          )}

          <button
            type="button"
            onClick={() => setMobileOpen((value) => !value)}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--color-border-strong)] text-lg text-[var(--color-text)] lg:hidden"
            aria-expanded={mobileOpen}
            aria-label="Mở menu"
          >
            {mobileOpen ? '×' : '≡'}
          </button>
        </div>
      </div>

      {logoutError && (
        <p
          role="alert"
          className="border-t border-[var(--color-danger-border)] px-6 py-2 text-center text-xs text-[var(--color-danger)]"
        >
          {logoutError}
        </p>
      )}

      {mobileOpen && (
        <div className="border-t border-[var(--color-border)] bg-[var(--color-bg)] px-6 py-5 lg:hidden">
          <nav className="flex flex-col gap-4">
            {visibleItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                className={navClass}
              >
                {item.label}
              </NavLink>
            ))}

            {session?.role === 'USER' && (
              <Link
                to="/auctions/create"
                onClick={() => setMobileOpen(false)}
                className="text-sm font-medium text-[var(--color-primary)]"
              >
                ＋ Tạo phiên đấu giá
              </Link>
            )}

            {session ? (
              <button
                type="button"
                onClick={() => void handleLogout()}
                disabled={loggingOut}
                className="border-t border-[var(--color-border)] pt-4 text-left text-sm text-[var(--color-danger)] disabled:opacity-60"
              >
                {loggingOut ? 'Đang đăng xuất...' : 'Đăng xuất'}
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-3 border-t border-[var(--color-border)] pt-4">
                <Link
                  to="/login"
                  onClick={() => setMobileOpen(false)}
                  className="text-center text-sm text-[var(--color-primary)]"
                >
                  Đăng nhập
                </Link>

                <Link
                  to="/register"
                  onClick={() => setMobileOpen(false)}
                  className="text-center text-sm text-[var(--color-primary)]"
                >
                  Đăng ký
                </Link>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}