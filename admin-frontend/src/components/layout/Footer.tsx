import { Link } from 'react-router-dom';
import Logo from '../common/Logo';

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-[var(--color-border)] bg-[var(--color-bg-deep)]">
      <div className="mx-auto grid max-w-7xl gap-8 px-6 py-9 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <Logo />
          <p className="mt-3 max-w-sm text-xs leading-5 text-[var(--color-text-dim)]">Nền tảng đấu giá trực tuyến dành cho những món đồ có câu chuyện và những người trân trọng giá trị thật.</p>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-3 text-xs text-[var(--color-text-muted)]">
          <Link to="/auctions" className="hover:text-[var(--color-primary)]">Khám phá</Link>
          <Link to="/my-auctions" className="hover:text-[var(--color-primary)]">Bán vật phẩm</Link>
          <a href="#" className="hover:text-[var(--color-primary)]">Điều khoản</a>
          <a href="#" className="hover:text-[var(--color-primary)]">Hỗ trợ</a>
        </div>
      </div>
      <div className="border-t border-[var(--color-surface-raised)] px-6 py-4 text-center font-mono-tag text-[10px] text-[var(--color-text-dim)]">© 2026 Live Auction · </div>
    </footer>
  );
}
