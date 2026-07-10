import { Link } from 'react-router-dom';
import Logo from '../common/Logo';

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-[#2a3f31] bg-[#0c1711]">
      <div className="mx-auto grid max-w-7xl gap-8 px-6 py-9 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <Logo />
          <p className="mt-3 max-w-sm text-xs leading-5 text-[#607468]">Nền tảng đấu giá trực tuyến dành cho những món đồ có câu chuyện và những người trân trọng giá trị thật.</p>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-3 text-xs text-[#7d9186]">
          <Link to="/auctions" className="hover:text-[#C9A227]">Khám phá</Link>
          <Link to="/my-auctions" className="hover:text-[#C9A227]">Bán vật phẩm</Link>
          <a href="#" className="hover:text-[#C9A227]">Điều khoản</a>
          <a href="#" className="hover:text-[#C9A227]">Hỗ trợ</a>
        </div>
      </div>
      <div className="border-t border-[#1d2d23] px-6 py-4 text-center font-mono-tag text-[10px] text-[#4a5a4f]">© 2026 Live Auction · Giao diện dữ liệu mẫu</div>
    </footer>
  );
}
