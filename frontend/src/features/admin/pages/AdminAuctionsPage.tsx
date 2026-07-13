import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Auction, AuctionApprovalStatus } from '../../auction/types';
import { approvalStatusLabel, approvalStatusTone, auctionStatusLabel, auctionStatusTone } from '../../../constants/auctionStatus';
import { formatCurrency } from '../../../utils/formatCurrency';
import { getDemoAuctions, updateDemoAuction, updateDemoAuctionApproval } from '../../../store/auctionStore';

export default function AdminAuctionsPage() {
  const [items, setItems] = useState<Auction[]>(getDemoAuctions());
  const [filter, setFilter] = useState<AuctionApprovalStatus | 'ALL'>('PENDING');
  const visible = useMemo(() => items.filter((item) => filter === 'ALL' || item.approvalStatus === filter), [items, filter]);

  const setApproval = (id: number, approvalStatus: AuctionApprovalStatus) => {
    setItems(updateDemoAuctionApproval(id, approvalStatus));
  };

  const cancelAuction = (id: number) => {
    setItems(updateDemoAuction(id, { status: 'CANCELLED' }));
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-10 sm:py-14">
      <span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[var(--color-primary)]">Admin · Kiểm duyệt</span>
      <h1 className="mt-2 font-display text-4xl">Quản lý phiên đấu giá</h1>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">Phiên do thành viên gửi phải được duyệt trước khi xuất hiện công khai.</p>

      <div className="mt-7 flex gap-2 overflow-x-auto">
        {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((status) => (
          <button key={status} onClick={() => setFilter(status)} className={`rounded-full border px-4 py-2 text-xs ${filter === status ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-bg)]' : 'border-[var(--color-border-strong)] text-[var(--color-text-muted)]'}`}>
            {status === 'ALL' ? 'Tất cả' : approvalStatusLabel[status]}
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-4">
        {visible.length ? visible.map((auction) => (
          <article key={auction.id} className="grid gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 md:grid-cols-[100px_1fr_auto] md:items-center">
            <img src={auction.image} alt={auction.title} className="h-20 w-full rounded-lg object-cover md:w-24" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-2.5 py-1 text-[10px] ${approvalStatusTone[auction.approvalStatus]}`}>{approvalStatusLabel[auction.approvalStatus]}</span>
                <span className={`rounded-full border px-2.5 py-1 text-[10px] ${auctionStatusTone[auction.status]}`}>{auctionStatusLabel[auction.status]}</span>
                <span className="text-xs text-[var(--color-text-dim)]">Người đăng: {auction.seller}</span>
              </div>
              <h2 className="mt-2 font-display text-lg">{auction.title}</h2>
              <p className="mt-2 text-xs text-[var(--color-text-muted)]">{formatCurrency(auction.currentPrice)} · {auction.bidCount} lượt bid · {auction.category}</p>
            </div>
            <div className="flex flex-wrap gap-2 md:max-w-64 md:justify-end">
              <Link to={`/auctions/${auction.id}`} className="rounded-md border border-[var(--color-border-strong)] px-3 py-2 text-xs">Chi tiết</Link>
              {auction.approvalStatus === 'PENDING' && <button onClick={() => setApproval(auction.id, 'APPROVED')} className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-xs font-semibold text-[var(--color-bg)]">Duyệt</button>}
              {auction.approvalStatus === 'PENDING' && <button onClick={() => setApproval(auction.id, 'REJECTED')} className="rounded-md border border-[var(--color-danger-solid)]/50 px-3 py-2 text-xs text-[var(--color-danger)]">Từ chối</button>}
              {auction.approvalStatus === 'REJECTED' && <button onClick={() => setApproval(auction.id, 'PENDING')} className="rounded-md border border-[var(--color-primary)]/50 px-3 py-2 text-xs text-[var(--color-primary-hover)]">Xem xét lại</button>}
              {auction.approvalStatus === 'APPROVED' && auction.status !== 'ENDED' && auction.status !== 'CANCELLED' && <button onClick={() => cancelAuction(auction.id)} className="rounded-md border border-[var(--color-danger-solid)]/50 px-3 py-2 text-xs text-[var(--color-danger)]">Hủy phiên</button>}
            </div>
          </article>
        )) : <div className="rounded-xl border border-dashed border-[var(--color-border-strong)] py-16 text-center text-sm text-[var(--color-text-muted)]">Không có phiên nào trong trạng thái này.</div>}
      </div>
    </div>
  );
}
