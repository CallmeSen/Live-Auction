import { Outlet, Link } from 'react-router-dom';
import Logo from '../components/common/Logo';

export default function AuthLayout() {
  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-[var(--color-bg)]">
      {/* Showcase panel */}
      <div className="hidden lg:flex flex-col justify-between p-12 bg-[var(--color-surface-alt)] relative overflow-hidden border-r border-[var(--color-border)]">
        <div className="absolute inset-0 opacity-[0.05] bg-[radial-gradient(circle_at_20%_20%,var(--color-primary),transparent_45%)]" />

        <Link to="/login" className="relative z-10">
          <Logo />
        </Link>

        <div className="relative z-10">
          <span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[var(--color-primary)]">
            Lot 001 &mdash; Phiên đấu giá trực tuyến
          </span>
          <h1 className="font-display text-4xl leading-tight mt-4 text-[var(--color-text)]">
            Nơi mỗi lượt trả giá <br /> là một quyết định.
          </h1>
          <p className="mt-4 text-[var(--color-text-muted)] max-w-sm">
            Tham gia đấu giá trực tiếp, theo dõi giá thầu theo thời gian thực
            và giành lấy món đồ bạn muốn.
          </p>
        </div>

        <p className="relative z-10 font-mono-tag text-xs text-[var(--color-text-dim)]">
          © 2026 Auction App
        </p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <Link to="/login" className="lg:hidden mb-8 inline-flex">
            <Logo />
          </Link>
          <Outlet />
        </div>
      </div>
    </div>
  );
}