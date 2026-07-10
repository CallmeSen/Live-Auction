export default function Footer() {
  return (
    <footer className="border-t border-[#2a3f31] mt-auto">
      <div className="mx-auto max-w-7xl px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-2">
        <span className="font-mono-tag text-xs text-[#4a5a4f]">
          © 2026 Auction App. All rights reserved.
        </span>
        <div className="flex gap-6 text-xs text-[#7d9186]">
          <a href="#" className="hover:text-[#C9A227]">Điều khoản</a>
          <a href="#" className="hover:text-[#C9A227]">Bảo mật</a>
          <a href="#" className="hover:text-[#C9A227]">Hỗ trợ</a>
        </div>
      </div>
    </footer>
  );
}