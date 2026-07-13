import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Modal from '../../../components/common/Modal';
import { getDemoAuctions, updateDemoAuction } from '../../../store/auctionStore';
import { formatCurrency } from '../../../utils/formatCurrency';
import { formatDateTime } from '../../../utils/formatDate';
import { approvalStatusLabel, approvalStatusTone, auctionStatusLabel, auctionStatusTone } from '../../../constants/auctionStatus';
import useAuth from '../../../hooks/useAuth';

export default function MyAuctionsPage() {
  const { user } = useAuth();
  const location = useLocation();
  const initialItems = useMemo(() => getDemoAuctions().filter((item) => item.sellerEmail === user?.email), [user?.email]);
  const [items, setItems] = useState(initialItems);
  const [cancelId, setCancelId] = useState<number | null>(null);
  const cancelAuction = () => {
    if (cancelId) {
      updateDemoAuction(cancelId, { status: 'CANCELLED' });
      setItems((current) => current.map((item) => item.id === cancelId ? { ...item, status: 'CANCELLED' } : item));
    }
    setCancelId(null);
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-10 sm:py-14">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[var(--color-primary)]">Kênh bán của thành viên</span><h1 className="mt-2 font-display text-4xl">Phiên đấu giá của tôi</h1><p className="mt-2 text-sm text-[var(--color-text-muted)]">Theo dõi trạng thái kiểm duyệt, giá và lượt trả của các vật phẩm bạn đăng.</p></div><Link to="/auctions/create" className="rounded-md bg-[var(--color-primary)] px-5 py-3 text-center text-sm font-semibold text-[var(--color-bg)]">＋ Tạo phiên mới</Link></div>
      {(location.state as { created?: boolean } | null)?.created && <p className="mt-6 rounded-xl border border-[var(--color-success-border)]/40 bg-[var(--color-success-bg)]/15 px-5 py-4 text-sm text-[var(--color-success)]">Đã gửi phiên thành công. Phiên đang chờ Admin duyệt và chưa xuất hiện công khai.</p>}
      <div className="mt-9 grid gap-4 md:grid-cols-4">{[[items.length, 'Tổng phiên'], [items.filter((item) => item.status === 'ACTIVE').length, 'Đang hoạt động'], [items.reduce((sum, item) => sum + item.bidCount, 0), 'Tổng lượt trả'], [formatCurrency(items.reduce((sum, item) => sum + item.currentPrice, 0)), 'Tổng giá hiện tại']].map(([value, label]) => <div key={label} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"><p className="font-display text-2xl text-[var(--color-text)]">{value}</p><p className="mt-1 text-xs text-[var(--color-text-muted)]">{label}</p></div>)}</div>
      <div className="mt-7 space-y-4">{items.length ? items.map((auction) => <article key={auction.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"><div className="grid gap-5 lg:grid-cols-[110px_1fr_auto] lg:items-center"><img src={auction.image} alt={auction.title} className="h-24 w-full rounded-lg object-cover lg:w-28" /><div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2.5 py-1 text-[10px] ${approvalStatusTone[auction.approvalStatus]}`}>{approvalStatusLabel[auction.approvalStatus]}</span><span className={`rounded-full border px-2.5 py-1 text-[10px] ${auctionStatusTone[auction.status]}`}>{auctionStatusLabel[auction.status]}</span><span className="text-xs text-[var(--color-text-dim)]">Tạo {formatDateTime(auction.createdAt)}</span></div><h2 className="mt-2 font-display text-xl">{auction.title}</h2><div className="mt-3 grid gap-2 text-xs text-[var(--color-text-muted)] sm:grid-cols-4"><span>Khởi điểm <strong className="block text-[var(--color-text)]">{formatCurrency(auction.startingPrice)}</strong></span><span>Hiện tại <strong className="block text-[var(--color-primary)]">{formatCurrency(auction.currentPrice)}</strong></span><span>Giá cao nhất <strong className="block text-[var(--color-text)]">{formatCurrency(auction.currentPrice)}</strong></span><span>Tổng bid <strong className="block text-[var(--color-text)]">{auction.bidCount}</strong></span></div><p className="mt-3 text-xs text-[var(--color-text-dim)]">{formatDateTime(auction.startTime)} → {formatDateTime(auction.endTime)}</p></div><div className="flex flex-wrap gap-2 lg:flex-col"><Link to={`/auctions/${auction.id}`} className="rounded-md border border-[var(--color-border-strong)] px-4 py-2 text-center text-xs text-[var(--color-text)]">Xem chi tiết</Link><Link to={`/my-auctions/${auction.id}/edit`} className={`rounded-md border border-[var(--color-primary)]/40 px-4 py-2 text-center text-xs text-[var(--color-primary)] ${auction.status === 'ENDED' || auction.status === 'CANCELLED' ? 'pointer-events-none opacity-40' : ''}`}>Chỉnh sửa</Link><button disabled={auction.approvalStatus !== 'PENDING' && auction.status !== 'UPCOMING'} onClick={() => setCancelId(auction.id)} className="rounded-md border border-[var(--color-danger-solid)]/40 px-4 py-2 text-xs text-[var(--color-danger)] disabled:cursor-not-allowed disabled:opacity-35">Hủy phiên</button></div></div></article>) : <div className="rounded-xl border border-dashed border-[var(--color-border-strong)] py-16 text-center"><p className="font-display text-xl">Bạn chưa tạo phiên đấu giá nào</p><Link to="/auctions/create" className="mt-3 inline-block text-sm text-[var(--color-primary)]">Đăng vật phẩm đầu tiên</Link></div>}</div>
      <Modal open={cancelId !== null} title="Xác nhận hủy phiên" onClose={() => setCancelId(null)}><p className="text-sm leading-6 text-[var(--color-text-soft)]">Bạn có thể hủy phiên đang chờ duyệt hoặc phiên sắp diễn ra. Thao tác này được lưu trong dữ liệu mock của trình duyệt.</p><div className="mt-6 flex justify-end gap-3"><button onClick={() => setCancelId(null)} className="rounded-md border border-[var(--color-border-strong)] px-4 py-2 text-sm">Không hủy</button><button onClick={cancelAuction} className="rounded-md bg-[var(--color-danger-solid)] px-4 py-2 text-sm font-semibold text-white">Xác nhận hủy</button></div></Modal>
    </div>
  );
}
