import { Link } from 'react-router-dom';
import { mockMyBids } from '../../../mocks/auctions';
import { formatCurrency } from '../../../utils/formatCurrency';
import { formatDateTime } from '../../../utils/formatDate';

const statusStyle = {
  WINNING: { label: 'Đang dẫn đầu', className: 'bg-[#2f6541]/20 text-[#8fc99c] border-[#4e8b5e]/30' },
  OUTBID: { label: 'Đã bị vượt', className: 'bg-[#C2452D]/10 text-[#ff9a86] border-[#C2452D]/30' },
  WON: { label: 'Đã thắng', className: 'bg-[#C9A227]/10 text-[#e0c15a] border-[#C9A227]/30' },
};

export default function MyBidsPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-10 sm:py-14">
      <span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[#C9A227]">Hoạt động cá nhân</span>
      <h1 className="mt-2 font-display text-4xl">Lượt trả giá của tôi</h1>
      <p className="mt-2 text-sm text-[#7d9186]">Theo dõi các lot bạn đã tham gia và nhanh chóng đặt giá lại khi bị vượt.</p>

      <div className="mt-8 flex gap-2 overflow-x-auto">
        {['Tất cả  03', 'Đang dẫn đầu  01', 'Đã bị vượt  01', 'Đã thắng  01'].map((label, index) => (
          <button key={label} className={`whitespace-nowrap rounded-full border px-4 py-2 text-xs ${index === 0 ? 'border-[#C9A227] bg-[#C9A227] text-[#0F1B14]' : 'border-[#3a4d40] text-[#7d9186]'}`}>{label}</button>
        ))}
      </div>

      <div className="mt-6 space-y-4">
        {mockMyBids.map((bid) => {
          const status = statusStyle[bid.status];
          return (
            <article key={bid.id} className="grid gap-5 rounded-xl border border-[#2a3f31] bg-[#14231a] p-4 sm:grid-cols-[128px_1fr_auto] sm:items-center sm:p-5">
              <img src={bid.image} alt={bid.auctionTitle} className="h-28 w-full rounded-lg object-cover sm:h-24 sm:w-32" />
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-wider ${status.className}`}>{status.label}</span>
                  <span className="rounded-full border border-[#3a4d40] px-3 py-1 text-[10px] text-[#8ca093]">{bid.auctionStatus}</span>
                  <span className="text-xs text-[#607468]">{formatDateTime(bid.bidTime)}</span>
                </div>
                <h2 className="mt-2 font-display text-xl">{bid.auctionTitle}</h2>
                <div className="mt-3 flex flex-wrap gap-6 text-xs text-[#7d9186]">
                  <span>Giá của bạn <strong className="ml-1 font-medium text-[#F3EFE6]">{formatCurrency(bid.myBid)}</strong></span>
                  <span>Giá hiện tại <strong className="ml-1 font-medium text-[#C9A227]">{formatCurrency(bid.currentPrice)}</strong></span>
                  <span>Kết thúc <strong className="ml-1 font-medium text-[#F3EFE6]">{formatDateTime(bid.auctionEndTime)}</strong></span>
                </div>
              </div>
              <Link to={`/auctions/${bid.auctionId}`} className={`rounded-md px-4 py-2.5 text-center text-sm font-semibold transition ${bid.status === 'OUTBID' ? 'bg-[#C9A227] text-[#0F1B14] hover:bg-[#e0c15a]' : 'border border-[#3a4d40] text-[#F3EFE6] hover:border-[#C9A227]'}`}>
                {bid.status === 'OUTBID' ? 'Đặt giá lại' : 'Xem phiên'}
              </Link>
            </article>
          );
        })}
      </div>
    </div>
  );
}
