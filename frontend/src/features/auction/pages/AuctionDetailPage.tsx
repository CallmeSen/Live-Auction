import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import BidForm from '../../../components/auction/BidForm';
import AuctionCard from '../../../components/auction/AuctionCard';
import { mockBidHistory } from '../../../mocks/auctions';
import { formatCurrency } from '../../../utils/formatCurrency';
import { formatDateTime, getTimeLeft } from '../../../utils/formatDate';
import { approvalStatusLabel, approvalStatusTone, auctionStatusLabel, auctionStatusTone } from '../../../constants/auctionStatus';
import useAuth from '../../../hooks/useAuth';
import AuthRequiredModal from '../../../components/common/AuthRequiredModal';
import { getDemoAuctions, getPublicDemoAuctions, updateDemoAuctionApproval } from '../../../store/auctionStore';

export default function AuctionDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const auction = getDemoAuctions().find((item) => item.id === Number(id));
  const [currentPrice, setCurrentPrice] = useState(auction?.currentPrice ?? 0);
  const [moderationMessage, setModerationMessage] = useState('');
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [approvalStatus, setApprovalStatus] = useState(auction?.approvalStatus ?? 'PENDING');

<<<<<<< HEAD
  if (!auction) return <div className="mx-auto max-w-7xl px-6 py-24 text-center"><h1 className="font-display text-3xl">Không tìm thấy phiên đấu giá</h1><Link to="/auctions" className="mt-4 inline-block text-[var(--color-primary)]">Quay về danh sách</Link></div>;
=======
  if (!auction) return <div className="mx-auto max-w-7xl px-6 py-24 text-center"><h1 className="font-display text-3xl">Không tìm thấy phiên đấu giá</h1>
  <Link to="/auction-items" className="mt-4 inline-block text-[var(--color-primary)]">Quay về danh sách</Link>
  </div>;
>>>>>>> 3d6cdde (temp: preserve auction frontend and backend changes)

  const related = getPublicDemoAuctions().filter((item) => item.id !== auction.id).slice(0, 3);
  const isOwner = user?.email === auction.sellerEmail;
  const canView = approvalStatus === 'APPROVED' || isOwner || user?.role === 'ADMIN';
  const canBid = user?.role === 'USER' && approvalStatus === 'APPROVED' && auction.status === 'ACTIVE' && !isOwner;
  const statusMessage = auction.status === 'UPCOMING' ? 'Phiên đấu giá chưa bắt đầu.' : auction.status === 'ENDED' ? 'Phiên đấu giá đã kết thúc.' : auction.status === 'CANCELLED' ? 'Phiên đấu giá đã bị hủy.' : '';

<<<<<<< HEAD
  if (!canView) return <div className="mx-auto max-w-7xl px-6 py-24 text-center"><h1 className="font-display text-3xl">Phiên đấu giá chưa được công khai</h1><p className="mt-3 text-sm text-[var(--color-text-muted)]">Phiên này đang chờ kiểm duyệt hoặc đã bị từ chối.</p><Link to="/auctions" className="mt-4 inline-block text-[var(--color-primary)]">Quay về danh sách</Link></div>;

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 sm:py-12">
      <Link to="/auctions" className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)]">← Quay lại danh sách</Link>
=======
  if (!canView) return <div className="mx-auto max-w-7xl px-6 py-24 text-center"><h1 className="font-display text-3xl">Phiên đấu giá chưa được công khai</h1><p className="mt-3 text-sm text-[var(--color-text-muted)]">Phiên này đang chờ kiểm duyệt hoặc đã bị từ chối.
  </p><Link to="/auction-items" className="mt-4 inline-block text-[var(--color-primary)]">Quay về danh sách</Link>
  </div>;

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 sm:py-12">
>>>>>>> 3d6cdde (temp: preserve auction frontend and backend changes)
      <div className="mt-7 grid gap-10 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-alt)]"><img src={auction.image} alt={auction.title} className="aspect-[4/3] w-full object-cover" /></div>
          <div className="mt-4 grid grid-cols-3 gap-3">{(auction.images ?? [auction.image, auction.image, auction.image]).map((image, index) => <button key={`${image}-${index}`} className={`overflow-hidden rounded-lg border ${index === 0 ? 'border-[var(--color-primary)]' : 'border-[var(--color-border)]'}`}><img src={image} alt={`${auction.title} ảnh ${index + 1}`} className="aspect-[4/3] w-full object-cover" /></button>)}</div>
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-3"><span className="font-mono-tag text-xs uppercase tracking-[0.18em] text-[var(--color-primary)]">Lot #{String(auction.id).padStart(3, '0')}</span><div className="flex flex-wrap gap-2"><span className={`rounded-full border px-3 py-1 text-xs ${approvalStatusTone[approvalStatus]}`}>{approvalStatusLabel[approvalStatus]}</span><span className={`rounded-full border px-3 py-1 text-xs ${auctionStatusTone[auction.status]}`}>{auctionStatusLabel[auction.status]}</span></div></div>
          <h1 className="mt-4 font-display text-4xl leading-tight text-[var(--color-text)] sm:text-5xl">{auction.title}</h1>
          <p className="mt-4 leading-7 text-[var(--color-text-soft)]">{auction.description}</p>

          <dl className="mt-7 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-border)]">
            {[
              ['Giá khởi điểm', formatCurrency(auction.startingPrice)], ['Giá hiện tại', formatCurrency(currentPrice)],
              ['Bước giá', formatCurrency(auction.minimumBidIncrement)], ['Lượt trả giá', `${auction.bidCount} lượt`],
              ['Bắt đầu', formatDateTime(auction.startTime)], ['Kết thúc', formatDateTime(auction.endTime)],
              ['Người bán', auction.seller], ['Địa điểm', auction.location],
            ].map(([label, value]) => <div key={label} className="bg-[var(--color-surface)] p-4"><dt className="text-[11px] uppercase tracking-wider text-[var(--color-text-dim)]">{label}</dt><dd className="mt-1 text-sm text-[var(--color-text)]">{value}</dd></div>)}
          </dl>

          <div className="mt-7">
            {!user && approvalStatus === 'APPROVED' && auction.status === 'ACTIVE' && (
              <div className="rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-surface-alt)] p-6 text-center">
                <p className="text-sm leading-6 text-[var(--color-text-soft)]">
                  Bạn có thể xem thông tin phiên đấu giá mà không cần tài khoản.
                  Hãy đăng nhập hoặc đăng ký khi muốn tham gia trả giá.
                </p>

                <button
                  type="button"
                  onClick={() => setAuthModalOpen(true)}
                  className="mt-4 rounded-md bg-[var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-[var(--color-bg)] hover:bg-[var(--color-primary-hover)]"
                >
                  Tham gia đấu giá
                </button>
              </div>
            )}

            {!user && auction.status !== 'ACTIVE' && statusMessage && (
              <div className="rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface-alt)] p-5 text-sm text-[var(--color-primary-hover)]">
                {statusMessage}
              </div>
            )}

            <AuthRequiredModal
              open={authModalOpen}
              onClose={() => setAuthModalOpen(false)}
            />
            {canBid && <BidForm currentPrice={currentPrice} minimumBidIncrement={auction.minimumBidIncrement} walletBalance={37_000_000} onPlaceBid={setCurrentPrice} />}
            {user && !canBid && user.role === 'USER' && !isOwner && statusMessage && <div className="rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface-alt)] p-5 text-sm text-[var(--color-primary-hover)]">{statusMessage}</div>}
<<<<<<< HEAD
            {isOwner && user?.role === 'USER' && <div className="rounded-xl border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10 p-5"><p className="text-sm text-[var(--color-primary-hover)]">Đây là phiên do bạn đăng. Bạn không thể tự tham gia trả giá món hàng của mình.</p><p className="mt-2 text-xs text-[var(--color-text-soft)]">Trạng thái kiểm duyệt: {approvalStatusLabel[approvalStatus]}.</p><Link to={`/my-auctions/${auction.id}/edit`} className="mt-4 inline-block text-sm font-semibold text-[var(--color-text)]">Chỉnh sửa phiên →</Link></div>}
=======
            {isOwner && user?.role === 'USER' && <div className="rounded-xl border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10 p-5"><p className="text-sm text-[var(--color-primary-hover)]">Đây là phiên do bạn đăng. Bạn không thể tự tham gia trả giá món hàng của mình.</p><p className="mt-2 text-xs text-[var(--color-text-soft)]">Trạng thái kiểm duyệt: {approvalStatusLabel[approvalStatus]}.
              </p>
              <Link to={`/auction-sessions/my/${auction.id}/edit`} className="mt-4 inline-block text-sm font-semibold text-[var(--color-text)]">
              Chỉnh sửa phiên →</Link>
              </div>}
>>>>>>> 3d6cdde (temp: preserve auction frontend and backend changes)
            {user?.role === 'ADMIN' && <div className="rounded-xl border border-[var(--color-primary)] bg-[var(--color-surface-raised)] p-5"><p className="text-xs uppercase tracking-wider text-[var(--color-primary)]">Công cụ kiểm duyệt</p><div className="mt-4 flex gap-3"><button onClick={() => { updateDemoAuctionApproval(auction.id, 'APPROVED'); setApprovalStatus('APPROVED'); setModerationMessage('Đã duyệt phiên. Phiên có thể xuất hiện công khai.'); }} className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-xs font-semibold text-[var(--color-bg)]">Duyệt phiên</button><button onClick={() => { updateDemoAuctionApproval(auction.id, 'REJECTED'); setApprovalStatus('REJECTED'); setModerationMessage('Đã từ chối phiên đấu giá.'); }} className="rounded-md border border-[var(--color-danger-solid)]/60 px-4 py-2 text-xs text-[var(--color-danger)]">Từ chối</button></div>{moderationMessage && <p className="mt-3 text-xs text-[var(--color-success)]">{moderationMessage}</p>}</div>}
          </div>
        </div>
      </div>

      <section className="mt-16 grid gap-8 border-t border-[var(--color-border)] pt-12 lg:grid-cols-[1fr_0.85fr]">
        <div><span className="font-mono-tag text-xs uppercase tracking-[0.18em] text-[var(--color-primary)]">Thông tin vật phẩm</span><h2 className="mt-3 font-display text-3xl">Câu chuyện phía sau</h2><p className="mt-4 max-w-2xl leading-7 text-[var(--color-text-soft)]">{auction.description}</p><div className="mt-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-sm text-[var(--color-text-muted)]">{auction.status === 'ACTIVE' ? `Còn ${getTimeLeft(auction.endTime)}. ` : ''}Người trả giá cao nhất sẽ nhận hướng dẫn thanh toán sau khi phiên đóng.</div></div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"><div className="flex items-center justify-between"><h3 className="font-display text-xl">Lịch sử trả giá</h3><span className="text-xs text-[var(--color-text-muted)]">Mới nhất trước</span></div><div className="mt-4 divide-y divide-[var(--color-border)]">{mockBidHistory.filter((bid) => bid.auctionId === auction.id).length ? mockBidHistory.filter((bid) => bid.auctionId === auction.id).map((bid) => <div key={bid.id} className="flex items-center justify-between py-3"><div><p className={`text-sm ${bid.isMine ? 'text-[var(--color-primary)]' : 'text-[var(--color-text)]'}`}>{bid.bidder}</p><p className="mt-0.5 text-xs text-[var(--color-text-dim)]">{formatDateTime(bid.time)}</p></div><span className="font-mono-tag text-sm">{formatCurrency(bid.amount)}</span></div>) : <p className="py-8 text-center text-sm text-[var(--color-text-dim)]">Chưa có lượt trả giá.</p>}</div></div>
      </section>

      <section className="mt-16 border-t border-[var(--color-border)] pt-12"><h2 className="font-display text-3xl">Có thể bạn quan tâm</h2><div className="mt-7 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{related.map((item) => <AuctionCard key={item.id} auction={item} />)}</div></section>
    </div>
  );
}
