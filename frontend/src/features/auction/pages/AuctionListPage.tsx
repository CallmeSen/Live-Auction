export default function AuctionListPage() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-16">
      <div className="max-w-2xl">
        <span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[#C9A227]">
          Phiên đấu giá
        </span>
        <h1 className="font-display text-4xl mt-3 text-[#F3EFE6]">
          Các lot đang mở đấu giá
        </h1>
        <p className="mt-3 text-[#7d9186]">
          Danh sách sản phẩm sẽ hiển thị tại đây sau khi kết nối với backend.
        </p>
      </div>

      {/* Empty state - sẽ thay bằng danh sách AuctionCard thật khi có API */}
      <div className="mt-16 flex flex-col items-center justify-center rounded-xl border border-dashed border-[#2a3f31] py-24 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#2a3f31] font-mono-tag text-lg text-[#4a5a4f]">
          0
        </span>
        <h3 className="font-display text-xl mt-4 text-[#F3EFE6]">
          Chưa có phiên đấu giá nào
        </h3>
        <p className="mt-2 text-sm text-[#7d9186] max-w-xs">
          Khi backend được kết nối, các lot đang mở sẽ xuất hiện ở đây.
        </p>
      </div>
    </div>
  );
}