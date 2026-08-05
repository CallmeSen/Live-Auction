import { useMemo } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import Logo from '../common/Logo';
import useAuth from '../../hooks/useAuth';

const navClass = ({ isActive }: { isActive: boolean }) =>
  isActive
    ? 'text-sm font-medium text-[var(--color-primary)]'
    : 'text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]';

export default function Navbar() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const initials = useMemo(
    () => user?.fullName.split(/s+/).filter(Boolean).slice(-2).map((word) => word[0]).join('').toUpperCase() || 'A',
    [user],
  );

  const signOut = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-bg)]/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-4">
        <Link to="/admin" aria-label="Về tổng quan quản trị"><Logo /></Link>
        <nav className="flex flex-wrap items-center justify-center gap-5">
          <NavLink to="/admin" end className={navClass}>Tổng quan</NavLink>
          <NavLink to="/admin/users" className={navClass}>Người dùng</NavLink>
          <NavLink to="/admin/auctions" className={navClass}>Kiểm duyệt</NavLink>
          <NavLink to="/admin/categories" className={navClass}>Danh mục</NavLink>
          {user?.isPrimaryAdmin && <NavLink to="/admin/admin-accounts" className={navClass}>Quản trị viên</NavLink>}
        </nav>
        <div className="flex items-center gap-3">
          <Link to="/admin/profile" className="hidden text-right sm:block" aria-label="Mở hồ sơ Admin">
            <p className="max-w-32 truncate text-xs hover:text-[var(--color-primary)]">{user?.fullName}</p>
            <p className="text-[10px] text-[var(--color-primary)]">{user?.isPrimaryAdmin ? 'Admin gốc' : 'Quản trị viên'}</p>
          </Link>
          <Link to="/admin/profile" className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border-strong)] text-xs font-semibold text-[var(--color-primary)] hover:border-[var(--color-primary)]" aria-label="Mở hồ sơ Admin">
            {initials}
          </Link>
          <button type="button" onClick={signOut} className="rounded-md border border-[var(--color-danger-border)] px-3 py-2 text-xs text-[var(--color-danger)]">Đăng xuất</button>
        </div>
      </div>
    </header>
  );
}
