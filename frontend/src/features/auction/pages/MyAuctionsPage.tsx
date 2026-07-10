import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Modal from '../../../components/common/Modal';
import { mockAuctions } from '../../../mocks/auctions';
import { formatCurrency } from '../../../utils/formatCurrency';
import { formatDateTime } from '../../../utils/formatDate';
import { auctionStatusLabel, auctionStatusTone } from '../../../constants/auctionStatus';
import useAuth from '../../../hooks/useAuth';

export default function MyAuctionsPage() {
  const { user } = useAuth();
  const initialItems = useMemo(() => mockAuctions.filter((item) => item.sellerEmail === user?.email), [user?.email]);
  const [items, setItems] = useState(initialItems);
  const [cancelId, setCancelId] = useState<number | null>(null);
  const cancelAuction = () => { if (cancelId) setItems((current) => current.map((item) => item.id === cancelId ? { ...item, status: 'CANCELLED' } : item)); setCancelId(null); };

  return (
    <div className="mx-auto max-w-7xl px-6 py-10 sm:py-14">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[#C9A227]">Seller workspace</span><h1 className="mt-2 font-display text-4xl">Phiên đấu giá của tôi</h1><p className="mt-2 text-sm text-[#7d9186]">Xem giá, lượt bid, chỉnh sửa hoặc hủy phiên phù hợp UC09.</p></div><Link to="/auctions/create" className="rounded-md bg-[#C9A227] px-5 py-3 text-center text-sm font-semibold text-[#0F1B14]">＋ Tạo phiên mới</Link></div>
      <div className="mt-9 grid gap-4 md:grid-cols-4">{[[items.length, 'Tổng phiên'], [items.filter((item) => item.status === 'ACTIVE').length, 'Đang hoạt động'], [items.reduce((sum, item) => sum + item.bidCount, 0), 'Tổng lượt trả'], [formatCurrency(items.reduce((sum, item) => sum + item.currentPrice, 0)), 'Tổng giá hiện tại']].map(([value, label]) => <div key={label} className="rounded-xl border border-[#2a3f31] bg-[#14231a] p-5"><p className="font-display text-2xl text-[#F3EFE6]">{value}</p><p className="mt-1 text-xs text-[#7d9186]">{label}</p></div>)}</div>
      <div className="mt-7 space-y-4">{items.map((auction) => <article key={auction.id} className="rounded-xl border border-[#2a3f31] bg-[#14231a] p-5"><div className="grid gap-5 lg:grid-cols-[110px_1fr_auto] lg:items-center"><img src={auction.image} alt={auction.title} className="h-24 w-full rounded-lg object-cover lg:w-28" /><div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2.5 py-1 text-[10px] ${auctionStatusTone[auction.status]}`}>{auctionStatusLabel[auction.status]}</span><span className="text-xs text-[#607468]">Tạo {formatDateTime(auction.createdAt)}</span></div><h2 className="mt-2 font-display text-xl">{auction.title}</h2><div className="mt-3 grid gap-2 text-xs text-[#7d9186] sm:grid-cols-4"><span>Khởi điểm <strong className="block text-[#F3EFE6]">{formatCurrency(auction.startingPrice)}</strong></span><span>Hiện tại <strong className="block text-[#C9A227]">{formatCurrency(auction.currentPrice)}</strong></span><span>Giá cao nhất <strong className="block text-[#F3EFE6]">{formatCurrency(auction.currentPrice)}</strong></span><span>Tổng bid <strong className="block text-[#F3EFE6]">{auction.bidCount}</strong></span></div><p className="mt-3 text-xs text-[#607468]">{formatDateTime(auction.startTime)} → {formatDateTime(auction.endTime)}</p></div><div className="flex flex-wrap gap-2 lg:flex-col"><Link to={`/auctions/${auction.id}`} className="rounded-md border border-[#3a4d40] px-4 py-2 text-center text-xs text-[#F3EFE6]">Xem chi tiết</Link><Link to={`/my-auctions/${auction.id}/edit`} className={`rounded-md border border-[#C9A227]/40 px-4 py-2 text-center text-xs text-[#C9A227] ${auction.status === 'ENDED' || auction.status === 'CANCELLED' ? 'pointer-events-none opacity-40' : ''}`}>Chỉnh sửa</Link><button disabled={auction.status !== 'UPCOMING'} onClick={() => setCancelId(auction.id)} className="rounded-md border border-[#C2452D]/40 px-4 py-2 text-xs text-[#ff9a86] disabled:cursor-not-allowed disabled:opacity-35">Hủy phiên</button></div></div></article>)}</div>
      <Modal open={cancelId !== null} title="Xác nhận hủy phiên" onClose={() => setCancelId(null)}><p className="text-sm leading-6 text-[#8ca093]">Phiên UPCOMING chưa có lượt bid có thể hủy. Đây là thao tác demo và chỉ thay đổi trạng thái trên màn hình.</p><div className="mt-6 flex justify-end gap-3"><button onClick={() => setCancelId(null)} className="rounded-md border border-[#3a4d40] px-4 py-2 text-sm">Không hủy</button><button onClick={cancelAuction} className="rounded-md bg-[#C2452D] px-4 py-2 text-sm font-semibold text-white">Xác nhận hủy</button></div></Modal>
    </div>
  );
}
