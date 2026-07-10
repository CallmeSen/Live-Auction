import { NavLink, useNavigate } from 'react-router-dom';
import Logo from '../common/Logo';

const navItems = [
  { label: 'Đang đấu giá', to: '/home' },
  { label: 'Của tôi', to: '/my-bids' },
  { label: 'Ví', to: '/wallet' },
];

export default function Navbar() {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-30 border-b border-[#2a3f31] bg-[#0F1B14]/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Logo />

        <nav className="hidden md:flex items-center gap-8">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `text-sm font-medium transition-colors ${
                  isActive ? 'text-[#C9A227]' : 'text-[#7d9186] hover:text-[#F3EFE6]'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <span className="hidden sm:flex items-center gap-1.5 font-mono-tag text-xs text-[#C9A227]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#C2452D] animate-pulse" />
            LIVE
          </span>
          <button
            onClick={handleLogout}
            className="text-xs font-medium text-[#7d9186] hover:text-[#C2452D] transition-colors"
          >
            Đăng xuất
          </button>
          <button className="flex h-9 w-9 items-center justify-center rounded-full border border-[#2a3f31] text-sm text-[#F3EFE6] hover:border-[#C9A227] transition-colors">
            NV
          </button>
        </div>
      </div>
    </header>
  );
}