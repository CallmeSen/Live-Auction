import { Link } from 'react-router-dom';
import { mockMyBids } from '../../../mocks/auctions';
import { formatCurrency } from '../../../utils/formatCurrency';
import { formatDateTime } from '../../../utils/formatDate';

const statusStyle = {
  WINNING: { label: 'Đang dẫn đầu', className: 'bg-[var(--color-success-bg)]/20 text-[var(--color-success)] border-[var(--color-success-border)]/30' },
  OUTBID: { label: 'Đã bị vượt', className: 'bg-[var(--color-danger-solid)]/10 text-[var(--color-danger)] border-[var(--color-danger-solid)]/30' },
  WON: { label: 'Đã thắng', className: 'bg-[var(--color-primary)]/10 text-[var(--color-primary-hover)] border-[var(--color-primary)]/30' },
};

export default function MyBidsPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-10 sm:py-14">
      <span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[var(--color-primary)]">Hoạt động cá nhân</span>
      <h1 className="mt-2 font-display text-4xl">Lượt trả giá của tôi</h1>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">Theo dõi các lot bạn đã tham gia và nhanh chóng đặt giá lại khi bị vượt.</p>

      <div className="mt-8 flex gap-2 overflow-x-auto">
        {['Tất cả  03', 'Đang dẫn đầu  01', 'Đã bị vượt  01', 'Đã thắng  01'].map((label, index) => (
          <button key={label} className={`whitespace-nowrap rounded-full border px-4 py-2 text-xs ${index === 0 ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-bg)]' : 'border-[var(--color-border-strong)] text-[var(--color-text-muted)]'}`}>{label}</button>
        ))}
      </div>

      <div className="mt-6 space-y-4">
        {mockMyBids.map((bid) => {
          const status = statusStyle[bid.status];
          return (
            <article key={bid.id} className="grid gap-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:grid-cols-[128px_1fr_auto] sm:items-center sm:p-5">
              <img src={bid.image} alt={bid.auctionTitle} className="h-28 w-full rounded-lg object-cover sm:h-24 sm:w-32" />
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-wider ${status.className}`}>{status.label}</span>
                  <span className="rounded-full border border-[var(--color-border-strong)] px-3 py-1 text-[10px] text-[var(--color-text-soft)]">{bid.auctionStatus}</span>
                  <span className="text-xs text-[var(--color-text-dim)]">{formatDateTime(bid.bidTime)}</span>
                </div>
                <h2 className="mt-2 font-display text-xl">{bid.auctionTitle}</h2>
                <div className="mt-3 flex flex-wrap gap-6 text-xs text-[var(--color-text-muted)]">
                  <span>Giá của bạn <strong className="ml-1 font-medium text-[var(--color-text)]">{formatCurrency(bid.myBid)}</strong></span>
                  <span>Giá hiện tại <strong className="ml-1 font-medium text-[var(--color-primary)]">{formatCurrency(bid.currentPrice)}</strong></span>
                  <span>Kết thúc <strong className="ml-1 font-medium text-[var(--color-text)]">{formatDateTime(bid.auctionEndTime)}</strong></span>
                </div>
              </div>
              <Link to={`/auctions/${bid.auctionId}`} className={`rounded-md px-4 py-2.5 text-center text-sm font-semibold transition ${bid.status === 'OUTBID' ? 'bg-[var(--color-primary)] text-[var(--color-bg)] hover:bg-[var(--color-primary-hover)]' : 'border border-[var(--color-border-strong)] text-[var(--color-text)] hover:border-[var(--color-primary)]'}`}>
                {bid.status === 'OUTBID' ? 'Đặt giá lại' : 'Xem phiên'}
              </Link>
            </article>
          );
        })}
      </div>
    </div>
  );
}
