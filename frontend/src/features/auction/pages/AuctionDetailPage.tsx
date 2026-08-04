import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import BidForm from '../../../components/auction/BidForm';
import AuctionChatBox from '../../../components/auction-chat/AuctionChatBox';
import AuthRequiredModal from '../../../components/common/AuthRequiredModal';
import useAuth from '../../../hooks/useAuth';
import { auctionItemService } from '../../../services/auctionItemService';
import type {
  AuctionItemDetailResponse,
  AuctionItemStatus,
} from '../../../interfaces/auctionItem';
import type { AuctionSessionStatus } from '../../../interfaces/auctionSession';
import { bidService } from '../../../services/bidService';
import { getApiErrorMessage } from '../../../services/apiError';
import { resolveBackendAssetUrl } from '../../../utils/assetUrl';
import { formatCurrency } from '../../../utils/formatCurrency';
import {
  formatDateTime,
  getTimeLeft,
} from '../../../utils/formatDate';
import useAuctionItemRealtime from '../../auction-items/hooks/useAuctionItemRealtime';

const VALID_ITEM_STATUSES: AuctionItemStatus[] = [
  'SOLD',
  'UNSOLD',
  'CANCELLED',
];

function normalizeItemStatus(
  status: string | null | undefined,
): AuctionItemStatus | null {
  if (
    status &&
    VALID_ITEM_STATUSES.includes(status as AuctionItemStatus)
  ) {
    return status as AuctionItemStatus;
  }

  return null;
}

function getItemStatusLabel(
  itemStatus: AuctionItemStatus,
  sessionStatus: AuctionSessionStatus,
): string {
  if (itemStatus === 'SOLD') {
    return 'Đã bán';
  }

  if (itemStatus === 'CANCELLED') {
    return 'Đã hủy';
  }

  if (itemStatus === 'UNSOLD' && sessionStatus === 'ACTIVE') {
    return 'Đang đấu giá';
  }

  if (itemStatus === 'UNSOLD' && sessionStatus === 'ENDED') {
    return 'Không bán được';
  }

  return 'Sắp đấu giá';
}

function isItemBiddableStatus(status: AuctionItemStatus): boolean {
  return status === 'UNSOLD';
}

export default function AuctionDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const {
    viewerCount,
    isConnected,
    connectionStatus,
    timelineEntries,
    sendChatMessage,
    lastError,
    clearLastError,
    currentPrice: realtimeCurrentPrice,
    startingPrice: realtimeStartingPrice,
    minIncrement: realtimeMinIncrement,
    status: realtimeItemStatus,
    latestBid,
  } = useAuctionItemRealtime(id);

  const [item, setItem] =
    useState<AuctionItemDetailResponse | null>(null);
  const [selectedImage, setSelectedImage] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [authModalOpen, setAuthModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadItem = async () => {
      if (!id) {
        setError('Không tìm thấy mã vật phẩm.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError('');

        const result = await auctionItemService.getItemById(id);

        if (cancelled) return;

        setItem(result);

        const displayableImages = result.images.filter(
          (image): image is typeof image & { imageUrl: string } =>
            Boolean(image.imageUrl),
        );

        const primaryImage =
          displayableImages.find((image) => image.isPrimary)?.imageUrl ??
          displayableImages[0]?.imageUrl ??
          '';

        setSelectedImage(primaryImage);
      } catch (requestError) {
        if (!cancelled) {
          setError(
            getApiErrorMessage(
              requestError,
              'Không thể tải thông tin vật phẩm.',
            ),
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadItem();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const handlePlaceBid = async (amount: number) => {
    if (!id) {
      throw new Error('Không tìm thấy mã vật phẩm.');
    }

    try {
      await bidService.placeBid(id, { amount });

      const refreshedItem =
        await auctionItemService.getItemById(id);

      setItem(refreshedItem);
    } catch (requestError) {
      throw new Error(
        getApiErrorMessage(
          requestError,
          'Không thể đặt giá. Vui lòng thử lại.',
        ),
        { cause: requestError },
      );
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-24 text-center">
        <p className="text-sm text-[var(--color-text-muted)]">
          Đang tải thông tin vật phẩm...
        </p>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-24 text-center">
        <h1 className="font-display text-3xl">
          Không thể hiển thị vật phẩm
        </h1>

        <p className="mt-3 text-sm text-[var(--color-danger)]">
          {error || 'Không tìm thấy vật phẩm.'}
        </p>

        <Link
          to="/auctions"
          className="mt-5 inline-block text-[var(--color-primary)]"
        >
          Quay về danh sách
        </Link>
      </div>
    );
  }

  const currentPrice = Number(
    realtimeCurrentPrice ?? item.currentPrice,
  );
  const startingPrice = Number(
    realtimeStartingPrice ?? item.startingPrice,
  );
  const minimumBidIncrement = Number(
    realtimeMinIncrement ?? item.session.minIncrement,
  );

  const effectiveItemStatus =
    normalizeItemStatus(realtimeItemStatus) ?? item.status;

  const isSessionActive = item.session.status === 'ACTIVE';

  const isSessionSeller = user?.id === item.session.sellerId;

  const canBid =
    user?.status === 'ACTIVE' &&
    isSessionActive &&
    isItemBiddableStatus(effectiveItemStatus) &&
    !isSessionSeller;

  const auctionIsOpen =
    isSessionActive && isItemBiddableStatus(effectiveItemStatus);

  const displayableImages = item.images.filter(
    (image): image is typeof image & { imageUrl: string } =>
      Boolean(image.imageUrl),
  );

  const selectedImageIndex = Math.max(
    displayableImages.findIndex(
      (image) => image.imageUrl === selectedImage,
    ),
    0,
  );

  const selectRelativeImage = (offset: number) => {
    if (displayableImages.length < 2) return;

    const nextIndex =
      (selectedImageIndex + offset + displayableImages.length) %
      displayableImages.length;

    setSelectedImage(displayableImages[nextIndex].imageUrl);
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 sm:py-12">
      <Link
        to={`/auction-sessions/${item.sessionId}`}
        className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
      >
        ← Quay lại phiên đấu giá
      </Link>

      <div className="mt-7 grid gap-10 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <div className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-alt)]">
            {selectedImage ? (
              <>
                <img
                  src={resolveBackendAssetUrl(selectedImage) ?? undefined}
                  alt={item.title}
                  className="aspect-[4/3] w-full object-cover"
                />

                {displayableImages.length > 1 && (
                  <>
                    <button
                      type="button"
                      aria-label="Xem ảnh trước"
                      onClick={() => selectRelativeImage(-1)}
                      className="absolute left-3 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-full border border-white/40 bg-black/55 p-2 text-white transition hover:bg-black/75"
                    >
                      <ChevronLeft size={22} />
                    </button>

                    <button
                      type="button"
                      aria-label="Xem ảnh tiếp theo"
                      onClick={() => selectRelativeImage(1)}
                      className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-full border border-white/40 bg-black/55 p-2 text-white transition hover:bg-black/75"
                    >
                      <ChevronRight size={22} />
                    </button>

                    <span className="absolute bottom-3 right-3 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
                      {selectedImageIndex + 1}/{displayableImages.length}
                    </span>
                  </>
                )}
              </>
            ) : (
              <div className="flex aspect-[4/3] items-center justify-center text-sm text-[var(--color-text-dim)]">
                Vật phẩm chưa có hình ảnh
              </div>
            )}
          </div>

          {displayableImages.length > 0 && (
            <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-5">
              {displayableImages.map((image, index) => (
                <button
                  type="button"
                  key={`${image.imageUrl}-${index}`}
                  onClick={() => setSelectedImage(image.imageUrl)}
                  className={`overflow-hidden rounded-lg border ${
                    selectedImage === image.imageUrl
                      ? 'border-[var(--color-primary)]'
                      : 'border-[var(--color-border)]'
                  }`}
                >
                  <img
                    src={resolveBackendAssetUrl(image.imageUrl) ?? undefined}
                    alt={`${item.title} ảnh ${index + 1}`}
                    className="aspect-[4/3] w-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="font-mono-tag text-xs uppercase tracking-[0.18em] text-[var(--color-primary)]">
              Vật phẩm #{item.id.slice(0, 8)}
            </span>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                {isConnected ? (
                  <>
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-primary)] opacity-60" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-primary)]" />
                    </span>
                    <span className="font-mono-tag uppercase tracking-wider text-[var(--color-primary)]">
                      Live
                    </span>
                    <span>
                      {viewerCount}{' '}
                      {viewerCount === 1 ? 'person' : 'people'} watching
                    </span>
                  </>
                ) : (
                  <span>Reconnecting...</span>
                )}
              </div>

              <span className="rounded-full border border-[var(--color-border-strong)] px-3 py-1 text-xs text-[var(--color-primary)]">
                {getItemStatusLabel(
                  effectiveItemStatus,
                  item.session.status,
                )}
              </span>
            </div>
          </div>

          <h1 className="mt-4 font-display text-4xl leading-tight text-[var(--color-text)] sm:text-5xl">
            {item.title}
          </h1>

          <p className="mt-4 leading-7 text-[var(--color-text-soft)]">
            {item.description || 'Vật phẩm chưa có mô tả.'}
          </p>

          <dl className="mt-7 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-border)]">
            {[
              [
                'Giá khởi điểm',
                formatCurrency(startingPrice),
              ],
              [
                'Giá hiện tại',
                formatCurrency(currentPrice),
              ],
              [
                'Bước giá',
                formatCurrency(minimumBidIncrement),
              ],
              [
                'Lượt trả giá',
                `${item.bids.length} lượt`,
              ],
              [
                'Kết thúc',
                formatDateTime(item.session.endTime),
              ],
              ['Người bán', item.seller.fullName],
            ].map(([label, value]) => (
              <div
                key={label}
                className="bg-[var(--color-surface)] p-4"
              >
                <dt className="text-[11px] uppercase tracking-wider text-[var(--color-text-dim)]">
                  {label}
                </dt>

                <dd className="mt-1 text-sm text-[var(--color-text)]">
                  {value}
                </dd>
              </div>
            ))}
          </dl>

          {latestBid && (
            <p className="mt-4 text-sm text-[var(--color-primary)]">
              Latest bid received in real time:{' '}
              {formatCurrency(Number(latestBid.amount))}
            </p>
          )}

          <div className="mt-7">
            {!user && auctionIsOpen && (
              <div className="rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-surface-alt)] p-6 text-center">
                <p className="text-sm leading-6 text-[var(--color-text-soft)]">
                  Bạn có thể xem vật phẩm mà không cần tài
                  khoản. Hãy đăng nhập hoặc đăng ký khi muốn
                  tham gia trả giá.
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

            <AuthRequiredModal
              open={authModalOpen}
              onClose={() => setAuthModalOpen(false)}
            />

            {canBid && (
              <BidForm
                currentPrice={currentPrice}
                minimumBidIncrement={minimumBidIncrement}
                onPlaceBid={handlePlaceBid}
              />
            )}

            {isSessionSeller && auctionIsOpen && (
              <div className="rounded-xl border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10 p-5 text-sm text-[var(--color-primary-hover)]">
                Bạn là người tổ chức phiên đấu giá này nên không thể
                trả giá.
              </div>
            )}

            {user &&
              effectiveItemStatus === 'SOLD' && (
                <div className="rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface-alt)] p-5 text-sm text-[var(--color-text-soft)]">
                  Vật phẩm đã được bán. Không thể tiếp tục trả giá.
                </div>
              )}

            {user &&
              effectiveItemStatus === 'CANCELLED' && (
                <div className="rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface-alt)] p-5 text-sm text-[var(--color-text-soft)]">
                  Vật phẩm đã bị hủy khỏi phiên đấu giá.
                </div>
              )}

            {user &&
              effectiveItemStatus === 'UNSOLD' &&
              !isSessionActive && (
                <div className="rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface-alt)] p-5 text-sm text-[var(--color-text-soft)]">
                  {item.session.status === 'ENDED'
                    ? 'Phiên đấu giá đã kết thúc. Vật phẩm chưa có người mua.'
                    : 'Phiên đấu giá chưa mở hoặc đã bị hủy.'}
                </div>
              )}

          </div>
        </div>
      </div>

      <section className="mt-10">
        <AuctionChatBox
          connectionStatus={connectionStatus}
          timelineEntries={timelineEntries}
          sendChatMessage={sendChatMessage}
          canSend={Boolean(user)}
          lastError={lastError}
          onClearLastError={clearLastError}
        />
      </section>

      <section className="mt-16 grid gap-8 border-t border-[var(--color-border)] pt-12 lg:grid-cols-[1fr_0.85fr]">
        <div>
          <span className="font-mono-tag text-xs uppercase tracking-[0.18em] text-[var(--color-primary)]">
            Thông tin vật phẩm
          </span>

          <h2 className="mt-3 font-display text-3xl">
            Câu chuyện phía sau
          </h2>

          <p className="mt-4 max-w-2xl leading-7 text-[var(--color-text-soft)]">
            {item.description || 'Vật phẩm chưa có mô tả.'}
          </p>

          <div className="mt-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-sm text-[var(--color-text-muted)]">
            {auctionIsOpen
              ? `Còn ${getTimeLeft(item.session.endTime)}.`
              : 'Vật phẩm hiện không mở nhận trả giá.'}
          </div>
        </div>

        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-xl">
              Lịch sử trả giá
            </h3>

            <span className="text-xs text-[var(--color-text-muted)]">
              Mới nhất trước
            </span>
          </div>

          <div className="mt-4 divide-y divide-[var(--color-border)]">
            {item.bids.length > 0 ? (
              item.bids.map((bid) => (
                <div
                  key={bid.id}
                  className="flex items-center justify-between py-3"
                >
                  <div>
                    <p className="text-sm text-[var(--color-text)]">
                      {bid.bidderName}
                    </p>

                    <p className="mt-0.5 text-xs text-[var(--color-text-dim)]">
                      {formatDateTime(bid.createdAt)}
                    </p>
                  </div>

                  <span className="font-mono-tag text-sm">
                    {formatCurrency(Number(bid.amount))}
                  </span>
                </div>
              ))
            ) : (
              <p className="py-8 text-center text-sm text-[var(--color-text-dim)]">
                Chưa có lượt trả giá.
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}