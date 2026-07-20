import { Link } from 'react-router-dom';
import type { Auction } from '../../features/auction/types';
import { formatCurrency } from '../../utils/formatCurrency';
import { formatDateTime, getTimeLeft } from '../../utils/formatDate';
import { auctionStatusLabel, auctionStatusTone } from '../../constants/auctionStatus';

export default function AuctionCard({ auction }: { auction: Auction }) {
  const shownPrice = auction.status === 'ENDED' ? auction.finalPrice ?? auction.currentPrice : auction.currentPrice;
  return (
    <article className="group overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] transition duration-300 hover:-translate-y-1 hover:border-[var(--color-border-strong)] hover:shadow-[0_24px_50px_rgba(0,0,0,0.28)]">
<<<<<<< HEAD
      <Link to={`/auctions/${auction.id}`} className="block">
=======
      <Link to={`/auction-items/${auction.id}`} className="block">
>>>>>>> 3d6cdde (temp: preserve auction frontend and backend changes)
        <div className="relative aspect-[4/3] overflow-hidden bg-[var(--color-surface-raised)]">
          <img src={auction.image} alt={auction.title} className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-bg)]/85 via-transparent to-transparent" />
          <span className={`absolute left-4 top-4 rounded-full border px-3 py-1 font-mono-tag text-[10px] uppercase tracking-[0.15em] ${auctionStatusTone[auction.status]}`}>
            {auction.status === 'ACTIVE' && <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#ff6b52]" />}
            {auctionStatusLabel[auction.status]}
          </span>
          <span className="absolute bottom-4 left-4 font-mono-tag text-xs text-[var(--color-text)]">
            {auction.status === 'ENDED' ? `Kết thúc ${formatDateTime(auction.endTime)}` : getTimeLeft(auction.endTime)}
          </span>
        </div>
        <div className="p-5">
          <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.14em] text-[var(--color-text-muted)]"><span>{auction.category}</span><span>{auction.bidCount} lượt trả</span></div>
          <h3 className="mt-3 min-h-14 font-display text-xl leading-snug text-[var(--color-text)] group-hover:text-[var(--color-primary-hover)]">{auction.title}</h3>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
            <div><p className="text-[var(--color-text-dim)]">Khởi điểm</p><p className="mt-1 text-[var(--color-text-muted)]">{formatCurrency(auction.startingPrice)}</p></div>
            <div><p className="text-[var(--color-text-dim)]">{auction.status === 'ENDED' ? 'Giá cuối' : 'Hiện tại'}</p><p className="mt-1 font-medium text-[var(--color-primary)]">{formatCurrency(shownPrice)}</p></div>
          </div>
          {auction.status === 'ENDED' && auction.winner && <p className="mt-3 rounded-md bg-[var(--color-surface-raised)] px-3 py-2 text-xs text-[var(--color-success)]">Người thắng: {auction.winner}</p>}
          <div className="mt-4 flex items-center justify-between border-t border-[var(--color-border)] pt-4">
            <span className="text-xs text-[var(--color-text-muted)]">Xem chi tiết vật phẩm</span>
            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border-strong)] text-[var(--color-primary)] transition group-hover:border-[var(--color-primary)] group-hover:bg-[var(--color-primary)] group-hover:text-[var(--color-bg)]">↗</span>
          </div>
        </div>
      </Link>
    </article>
  );
}
