import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import Logo from '../common/Logo';
import useAuth from '../../hooks/useAuth';
import { roleLabel } from '../../store/authStore';

const navItems = [
  { label: 'Khám phá', to: '/auctions' },
  { label: 'Đã đặt giá', to: '/my-bids', auth: true },
  { label: 'Phiên của tôi', to: '/my-auctions', auth: true },
];

export default function Navbar() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const visibleItems = navItems.filter((item) => !item.auth || user?.role === 'USER');
  const initials = user?.fullName.split(' ').slice(-2).map((part) => part[0]).join('').toUpperCase() ?? 'G';
  const handleLogout = () => { logout(); setMobileOpen(false); navigate('/auctions', { replace: true }); };
  const navClass = ({ isActive }: { isActive: boolean }) => 'text-sm font-medium transition-colors ' + (isActive ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-soft)] hover:text-[var(--color-text)]');

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-bg)]/95 backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-6">
        <Link to="/auctions" aria-label="Về trang chủ"><Logo /></Link>
        <nav className="hidden items-center gap-7 lg:flex">{visibleItems.map((item) => <NavLink key={item.to} to={item.to} className={navClass}>{item.label}</NavLink>)}</nav>
        <div className="flex items-center gap-3">
          {user?.role === 'USER' && <Link to="/auctions/create" className="hidden rounded-md bg-[var(--color-primary)] px-3.5 py-2 text-xs font-semibold text-[var(--color-bg)] sm:block">＋ Tạo phiên</Link>}
          {user ? <>
            <div className="hidden text-right sm:block"><p className="max-w-32 truncate text-xs">{user.fullName}</p><p className="text-[10px] text-[var(--color-primary)]">{roleLabel[user.role]}</p></div>
            <Link to="/profile" className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border-strong)] text-xs font-semibold text-[var(--color-primary)]">{initials}</Link>
            <button type="button" onClick={handleLogout} className="hidden rounded-md border border-[var(--color-danger-border)] px-3 py-2 text-xs text-[var(--color-danger)] sm:inline-flex">Đăng xuất</button>
          </> : <><Link to="/login" className="rounded-md border border-[var(--color-primary)] px-3 py-2 text-xs text-[var(--color-primary)]">Đăng nhập</Link><Link to="/register" className="hidden rounded-md bg-[var(--color-primary)] px-3 py-2 text-xs font-semibold text-[var(--color-bg)] sm:inline-flex">Đăng ký</Link></>}
          <button type="button" onClick={() => setMobileOpen((value) => !value)} className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--color-border-strong)] lg:hidden">{mobileOpen ? '×' : '≡'}</button>
        </div>
      </div>
      {mobileOpen && <div className="border-t border-[var(--color-border)] px-6 py-5 lg:hidden"><nav className="flex flex-col gap-4">
        {visibleItems.map((item) => <NavLink key={item.to} to={item.to} onClick={() => setMobileOpen(false)} className={navClass}>{item.label}</NavLink>)}
        {user?.role === 'USER' && <Link to="/auctions/create" onClick={() => setMobileOpen(false)} className="text-sm text-[var(--color-primary)]">＋ Tạo phiên</Link>}
        {user ? <button type="button" onClick={handleLogout} className="border-t border-[var(--color-border)] pt-4 text-left text-sm text-[var(--color-danger)]">Đăng xuất</button> : <div className="grid grid-cols-2 gap-3"><Link to="/login">Đăng nhập</Link><Link to="/register">Đăng ký</Link></div>}
      </nav></div>}
    </header>
  );
}
