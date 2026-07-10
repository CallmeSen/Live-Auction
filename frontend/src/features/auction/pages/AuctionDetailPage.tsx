import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import BidForm from '../../../components/auction/BidForm';
import AuctionCard from '../../../components/auction/AuctionCard';
import { mockAuctions, mockBidHistory } from '../../../mocks/auctions';
import { formatCurrency } from '../../../utils/formatCurrency';
import { formatDateTime, getTimeLeft } from '../../../utils/formatDate';
import { auctionStatusLabel, auctionStatusTone } from '../../../constants/auctionStatus';
import useAuth from '../../../hooks/useAuth';

export default function AuctionDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const auction = mockAuctions.find((item) => item.id === Number(id));
  const [currentPrice, setCurrentPrice] = useState(auction?.currentPrice ?? 0);
  const [moderationMessage, setModerationMessage] = useState('');

  if (!auction) return <div className="mx-auto max-w-7xl px-6 py-24 text-center"><h1 className="font-display text-3xl">Không tìm thấy phiên đấu giá</h1><Link to="/auctions" className="mt-4 inline-block text-[#C9A227]">Quay về danh sách</Link></div>;

  const related = mockAuctions.filter((item) => item.id !== auction.id).slice(0, 3);
  const isOwner = user?.email === auction.sellerEmail;
  const canBid = user?.role === 'BIDDER' && auction.status === 'ACTIVE' && !isOwner;
  const statusMessage = auction.status === 'UPCOMING' ? 'Phiên đấu giá chưa bắt đầu.' : auction.status === 'ENDED' ? 'Phiên đấu giá đã kết thúc.' : auction.status === 'CANCELLED' ? 'Phiên đấu giá đã bị hủy.' : '';

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 sm:py-12">
      <Link to="/auctions" className="text-sm text-[#7d9186] hover:text-[#C9A227]">← Quay lại danh sách</Link>
      <div className="mt-7 grid gap-10 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <div className="overflow-hidden rounded-2xl border border-[#2a3f31] bg-[#16241c]"><img src={auction.image} alt={auction.title} className="aspect-[4/3] w-full object-cover" /></div>
          <div className="mt-4 grid grid-cols-3 gap-3">{(auction.images ?? [auction.image, auction.image, auction.image]).map((image, index) => <button key={`${image}-${index}`} className={`overflow-hidden rounded-lg border ${index === 0 ? 'border-[#C9A227]' : 'border-[#2a3f31]'}`}><img src={image} alt={`${auction.title} ảnh ${index + 1}`} className="aspect-[4/3] w-full object-cover" /></button>)}</div>
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-3"><span className="font-mono-tag text-xs uppercase tracking-[0.18em] text-[#C9A227]">Lot #{String(auction.id).padStart(3, '0')}</span><span className={`rounded-full border px-3 py-1 text-xs ${auctionStatusTone[auction.status]}`}>{auctionStatusLabel[auction.status]}</span></div>
          <h1 className="mt-4 font-display text-4xl leading-tight text-[#F3EFE6] sm:text-5xl">{auction.title}</h1>
          <p className="mt-4 leading-7 text-[#8ca093]">{auction.description}</p>

          <dl className="mt-7 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[#2a3f31] bg-[#2a3f31]">
            {[
              ['Giá khởi điểm', formatCurrency(auction.startingPrice)], ['Giá hiện tại', formatCurrency(currentPrice)],
              ['Bước giá', formatCurrency(auction.minimumBidIncrement)], ['Lượt trả giá', `${auction.bidCount} lượt`],
              ['Bắt đầu', formatDateTime(auction.startTime)], ['Kết thúc', formatDateTime(auction.endTime)],
              ['Người bán', auction.seller], ['Địa điểm', auction.location],
            ].map(([label, value]) => <div key={label} className="bg-[#14231a] p-4"><dt className="text-[11px] uppercase tracking-wider text-[#607468]">{label}</dt><dd className="mt-1 text-sm text-[#F3EFE6]">{value}</dd></div>)}
          </dl>

          <div className="mt-7">
            {!user && <div className="rounded-2xl border border-[#3a4d40] bg-[#16241c] p-6 text-center"><p className="text-sm text-[#8ca093]">Đăng nhập bằng tài khoản bidder để tham gia trả giá.</p><Link to="/login" className="mt-4 inline-block rounded-md bg-[#C9A227] px-5 py-2.5 text-sm font-semibold text-[#0F1B14]">Đăng nhập để đặt giá</Link></div>}
            {canBid && <BidForm currentPrice={currentPrice} minimumBidIncrement={auction.minimumBidIncrement} walletBalance={37_000_000} onPlaceBid={setCurrentPrice} />}
            {user && !canBid && user.role === 'BIDDER' && statusMessage && <div className="rounded-xl border border-[#3a4d40] bg-[#16241c] p-5 text-sm text-[#e0c15a]">{statusMessage}</div>}
            {isOwner && user?.role === 'SELLER' && <div className="rounded-xl border border-[#C9A227]/40 bg-[#C9A227]/10 p-5"><p className="text-sm text-[#e0c15a]">Đây là phiên của bạn. Người bán không thể tự đặt giá.</p><Link to={`/my-auctions/${auction.id}/edit`} className="mt-4 inline-block text-sm font-semibold text-[#F3EFE6]">Chỉnh sửa phiên →</Link></div>}
            {user?.role === 'SELLER' && !isOwner && <div className="rounded-xl border border-[#3a4d40] bg-[#16241c] p-5 text-sm text-[#8ca093]">Tài khoản seller chỉ quản lý phiên bán, không thực hiện đặt giá trong bản demo.</div>}
            {user?.role === 'ADMIN' && <div className="rounded-xl border border-[#6a5a2d] bg-[#2a2617] p-5"><p className="text-xs uppercase tracking-wider text-[#C9A227]">Công cụ kiểm duyệt</p><div className="mt-4 flex gap-3"><button onClick={() => setModerationMessage('Đã duyệt phiên đấu giá mẫu.')} className="rounded-md bg-[#C9A227] px-4 py-2 text-xs font-semibold text-[#0F1B14]">Duyệt phiên</button><button onClick={() => setModerationMessage('Đã đánh dấu phiên cần xem xét.')} className="rounded-md border border-[#C2452D]/60 px-4 py-2 text-xs text-[#ff9a86]">Đánh dấu</button></div>{moderationMessage && <p className="mt-3 text-xs text-[#8fc99c]">{moderationMessage}</p>}</div>}
          </div>
        </div>
      </div>

      <section className="mt-16 grid gap-8 border-t border-[#2a3f31] pt-12 lg:grid-cols-[1fr_0.85fr]">
        <div><span className="font-mono-tag text-xs uppercase tracking-[0.18em] text-[#C9A227]">Thông tin vật phẩm</span><h2 className="mt-3 font-display text-3xl">Câu chuyện phía sau</h2><p className="mt-4 max-w-2xl leading-7 text-[#8ca093]">{auction.description}</p><div className="mt-6 rounded-xl border border-[#2a3f31] bg-[#14231a] p-5 text-sm text-[#7d9186]">{auction.status === 'ACTIVE' ? `Còn ${getTimeLeft(auction.endTime)}. ` : ''}Người trả giá cao nhất sẽ nhận hướng dẫn thanh toán sau khi phiên đóng.</div></div>
        <div className="rounded-xl border border-[#2a3f31] bg-[#14231a] p-5"><div className="flex items-center justify-between"><h3 className="font-display text-xl">Lịch sử trả giá</h3><span className="text-xs text-[#7d9186]">Mới nhất trước</span></div><div className="mt-4 divide-y divide-[#2a3f31]">{mockBidHistory.filter((bid) => bid.auctionId === auction.id).length ? mockBidHistory.filter((bid) => bid.auctionId === auction.id).map((bid) => <div key={bid.id} className="flex items-center justify-between py-3"><div><p className={`text-sm ${bid.isMine ? 'text-[#C9A227]' : 'text-[#F3EFE6]'}`}>{bid.bidder}</p><p className="mt-0.5 text-xs text-[#607468]">{formatDateTime(bid.time)}</p></div><span className="font-mono-tag text-sm">{formatCurrency(bid.amount)}</span></div>) : <p className="py-8 text-center text-sm text-[#607468]">Chưa có lượt trả giá.</p>}</div></div>
      </section>

      <section className="mt-16 border-t border-[#2a3f31] pt-12"><h2 className="font-display text-3xl">Có thể bạn quan tâm</h2><div className="mt-7 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{related.map((item) => <AuctionCard key={item.id} auction={item} />)}</div></section>
    </div>
  );
}
