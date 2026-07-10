import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import Logo from '../common/Logo';
import useAuth from '../../hooks/useAuth';
import { getRoleHome, roleLabel } from '../../store/authStore';
import type { UserRole } from '../../features/auth/types';

interface NavItem {
  label: string;
  to: string;
  roles?: UserRole[];
}

const navItems: NavItem[] = [
  { label: 'Khám phá', to: '/auctions' },
  { label: 'Đã đặt giá', to: '/my-bids', roles: ['BIDDER'] },
  { label: 'Phiên của tôi', to: '/my-auctions', roles: ['SELLER'] },
  { label: 'Ví', to: '/wallet', roles: ['BIDDER', 'SELLER'] },
  { label: 'Tổng quan', to: '/admin', roles: ['ADMIN'] },
  { label: 'Người dùng', to: '/admin/users', roles: ['ADMIN'] },
  { label: 'Kiểm duyệt', to: '/admin/auctions', roles: ['ADMIN'] },
  { label: 'Danh mục', to: '/admin/categories', roles: ['ADMIN'] },
];

export default function Navbar() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const visibleItems = navItems.filter((item) => !item.roles || (user && item.roles.includes(user.role)));
  const initials = user?.fullName.split(' ').slice(-2).map((part) => part[0]).join('').toUpperCase() ?? 'G';

  const handleLogout = () => {
    logout();
    setMobileOpen(false);
    navigate('/auctions', { replace: true });
  };

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `text-sm font-medium transition-colors ${isActive ? 'text-[#C9A227]' : 'text-[#8ca093] hover:text-[#F3EFE6]'}`;

  return (
    <header className="sticky top-0 z-40 border-b border-[#2a3f31] bg-[#0F1B14]/95 backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-6">
        <Link to={getRoleHome(user?.role)} aria-label="Về trang chính"><Logo /></Link>

        <nav className="hidden items-center gap-7 lg:flex" aria-label="Điều hướng chính">
          {visibleItems.map((item) => <NavLink key={item.to} to={item.to} className={navClass}>{item.label}</NavLink>)}
        </nav>

        <div className="flex items-center gap-3">
          {user?.role === 'SELLER' && <Link to="/auctions/create" className="hidden rounded-md bg-[#C9A227] px-3.5 py-2 text-xs font-semibold text-[#0F1B14] transition hover:bg-[#e0c15a] sm:block">＋ Tạo phiên</Link>}
          {user ? (
            <>
              <div className="hidden text-right sm:block">
                <p className="max-w-32 truncate text-xs text-[#F3EFE6]">{user.fullName}</p>
                <p className="mt-0.5 text-[10px] text-[#C9A227]">{roleLabel[user.role]}</p>
              </div>
              <Link to="/profile" className="flex h-9 w-9 items-center justify-center rounded-full border border-[#3a4d40] bg-[#16241c] text-xs font-semibold text-[#C9A227] transition hover:border-[#C9A227]" aria-label="Hồ sơ">{initials}</Link>
              <button
                type="button"
                onClick={handleLogout}
                className="hidden rounded-md border border-[#8f4538] px-3 py-2 text-xs font-medium text-[#ff9a86] transition hover:border-[#c95f4b] hover:bg-[#8f4538]/15 sm:inline-flex"
              >
                Đăng xuất
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="rounded-md border border-[#C9A227] px-3 py-2 text-xs font-semibold text-[#C9A227] hover:bg-[#C9A227]/10"
              >
                Đăng nhập
              </Link>

              <Link
                to="/register"
                className="hidden rounded-md bg-[#C9A227] px-3 py-2 text-xs font-semibold text-[#0F1B14] hover:bg-[#e0c15a] sm:inline-flex"
              >
                Đăng ký
              </Link>
            </>
          )}
          <button onClick={() => setMobileOpen((value) => !value)} className="flex h-9 w-9 items-center justify-center rounded-md border border-[#3a4d40] text-lg text-[#F3EFE6] lg:hidden" aria-expanded={mobileOpen} aria-label="Mở menu">{mobileOpen ? '×' : '≡'}</button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-[#2a3f31] bg-[#0F1B14] px-6 py-5 lg:hidden">
          <nav className="flex flex-col gap-4">
            {visibleItems.map((item) => <NavLink key={item.to} to={item.to} onClick={() => setMobileOpen(false)} className={navClass}>{item.label}</NavLink>)}
            {user?.role === 'SELLER' && <Link to="/auctions/create" onClick={() => setMobileOpen(false)} className="text-sm font-medium text-[#C9A227]">＋ Tạo phiên đấu giá</Link>}
            {!user && (
              <div className="grid grid-cols-2 gap-3 border-t border-[#2a3f31] pt-4">
                <Link
                  to="/login"
                  onClick={() => setMobileOpen(false)}
                  className="rounded-md border border-[#C9A227] px-4 py-2 text-center text-sm text-[#C9A227]"
                >
                  Đăng nhập
                </Link>

                <Link
                  to="/register"
                  onClick={() => setMobileOpen(false)}
                  className="rounded-md bg-[#C9A227] px-4 py-2 text-center text-sm font-semibold text-[#0F1B14]"
                >
                  Đăng ký
                </Link>
              </div>
            )}
            {user && <button onClick={handleLogout} className="border-t border-[#2a3f31] pt-4 text-left text-sm text-[#ff9a86]">Đăng xuất</button>}
          </nav>
        </div>
      )}
    </header>
  );
}
