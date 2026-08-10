import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { CatalogApi } from '../../../services/serverless/catalogApi';
import type {
  AuctionItem,
  SessionDetail,
  SessionStatus,
} from '../../../services/serverless/mappers';
import { runtimeConfig } from '../../../config/runtime';
import { mediaUrlForKey } from '../../../services/serverless/media';
import { useCatalogApi } from '../../../services/serverless/useCatalogApi';
import { useAuctionRoom } from '../../auction-room/useAuctionRoom';

const statusLabel: Record<SessionStatus, string> = {
  DRAFT: 'Bản nháp',
  SCHEDULED: 'Sắp diễn ra',
  LIVE: 'Đang diễn ra',
  COMPLETED: 'Đã kết thúc',
  CANCELLED: 'Đã hủy',
};

function formatEpoch(value: number | undefined): string {
  if (value === undefined) return 'Chưa lập lịch';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value * 1000));
}

function SessionItemCurrentPrice({
  item,
  catalogApi,
}: {
  item: AuctionItem;
  catalogApi: CatalogApi;
}) {
  const room = useAuctionRoom({
    itemId: item.id,
    catalogApi,
  });
  const currentPrice = room.currentPrice
    ?? item.live?.currentPrice
    ?? item.finalPrice
    ?? item.startPrice;

  return <span>{currentPrice}</span>;
}

type AuctionSessionDetailPageProps = {
  catalogApi?: CatalogApi;
};

export default function AuctionSessionDetailPage({
  catalogApi,
}: AuctionSessionDetailPageProps) {
  const { id } = useParams();
  const api = useCatalogApi(catalogApi);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState(!id);

  useEffect(() => {
    let active = true;
    if (!id) {
      return () => {
        active = false;
      };
    }

    void api.getSession(id).then(
      (result) => {
        if (!active) return;
        setDetail(result);
        setLoading(false);
      },
      () => {
        if (!active) return;
        setError(true);
        setLoading(false);
      },
    );

    return () => {
      active = false;
    };
  }, [api, id, retryKey]);

  return (
    <main className="mx-auto max-w-7xl px-6 py-10 sm:py-14">
      <Link to="/auctions" className="text-sm text-[var(--color-primary)]">
        Quay lại danh sách
      </Link>

      {loading && (
        <div role="status" className="py-20 text-center text-sm text-[var(--color-text-muted)]">
          Đang tải chi tiết phiên đấu giá...
        </div>
      )}

      {!loading && error && (
        <div role="alert" className="mt-8 border-y border-[var(--color-danger-solid)]/60 py-10 text-center">
          <p className="text-sm text-[var(--color-danger)]">
            Không thể tải chi tiết phiên đấu giá.
          </p>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setError(false);
              setRetryKey((value) => value + 1);
            }}
            className="mt-4 rounded-md border border-[var(--color-border-strong)] px-4 py-2 text-sm"
          >
            Thử lại
          </button>
        </div>
      )}

      {!loading && !error && detail && (
        <>
          <header className="mt-8 border-b border-[var(--color-border)] pb-9">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="rounded-full border border-[var(--color-primary)]/50 px-3 py-1 text-[var(--color-primary)]">
                {statusLabel[detail.session.status]}
              </span>
              <span className="text-[var(--color-text-muted)]">
                {detail.session.itemCount} vật phẩm
              </span>
            </div>
            <h1 className="mt-5 max-w-4xl font-display text-4xl text-[var(--color-text)] sm:text-5xl">
              {detail.session.title}
            </h1>
            <p className="mt-5 max-w-3xl text-sm leading-7 text-[var(--color-text-soft)]">
              {detail.session.description || 'Phiên chưa có mô tả.'}
            </p>
            <p className="mt-6 text-sm text-[var(--color-text-muted)]">
              Bắt đầu: {formatEpoch(detail.session.startTime)}
            </p>
          </header>

          {detail.rules && (
            <section className="border-b border-[var(--color-border)] py-9">
              <h2 className="font-display text-2xl">Quy tắc phiên</h2>
              <dl className="mt-6 grid gap-5 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-[var(--color-text-dim)]">Bước giá tối thiểu</dt>
                  <dd className="mt-2 font-display text-xl">{detail.rules.minIncrement}</dd>
                </div>
                <div>
                  <dt className="text-[var(--color-text-dim)]">Bước giá tối đa</dt>
                  <dd className="mt-2 font-display text-xl">{detail.rules.maxIncrement}</dd>
                </div>
                <div>
                  <dt className="text-[var(--color-text-dim)]">Cửa sổ gia hạn</dt>
                  <dd className="mt-2 font-display text-xl">
                    {detail.rules.antiSnipeWindowSeconds} giây
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--color-text-dim)]">Số lần gia hạn tối đa</dt>
                  <dd className="mt-2 font-display text-xl">{detail.rules.maxExtensions}</dd>
                </div>
              </dl>
            </section>
          )}

          <section className="py-9">
            <h2 className="font-display text-2xl">Vật phẩm</h2>
            {detail.items.length === 0 ? (
              <p className="mt-8 border-y border-dashed border-[var(--color-border-strong)] py-12 text-center text-sm text-[var(--color-text-muted)]">
                Phiên này chưa có vật phẩm.
              </p>
            ) : (
              <div className="mt-7 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {detail.items.map((item) => (
                  <article
                    key={item.id}
                    className="flex min-h-60 flex-col rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6"
                  >
                    <div className="flex justify-between gap-3 text-xs text-[var(--color-text-muted)]">
                      <span>#{item.sequenceNumber}</span>
                      <span>{item.status}</span>
                    </div>
                    {mediaUrlForKey(runtimeConfig.mediaBaseUrl, item.imageKeys[0]) && (
                      <div className="mt-4 aspect-[4/3] overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]">
                        <img
                          src={mediaUrlForKey(runtimeConfig.mediaBaseUrl, item.imageKeys[0]) ?? undefined}
                          alt={item.name}
                          className="h-full w-full object-contain"
                        />
                      </div>
                    )}
                    <h3 className="mt-5 font-display text-2xl">
                      <Link
                        to={`/auction-items/${encodeURIComponent(item.id)}`}
                        className="hover:text-[var(--color-primary)]"
                      >
                        {item.name}
                      </Link>
                    </h3>
                    <p className="mt-3 line-clamp-2 flex-1 text-sm leading-6 text-[var(--color-text-muted)]">
                      {item.description || 'Vật phẩm chưa có mô tả.'}
                    </p>
                    <dl className="mt-5 grid gap-3 border-t border-[var(--color-border)] pt-4 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-[var(--color-text-dim)]">Giá khởi điểm</dt>
                        <dd className="mt-1 font-display text-lg">{item.startPrice}</dd>
                      </div>
                      <div>
                        <dt className="text-[var(--color-text-dim)]">Giá hiện tại</dt>
                        <dd className="mt-1 font-display text-lg text-[var(--color-primary)]">
                          {item.status === 'LIVE' && item.live ? (
                            <SessionItemCurrentPrice item={item} catalogApi={api} />
                          ) : (
                            item.finalPrice ?? item.startPrice
                          )}
                        </dd>
                      </div>
                    </dl>
                    <Link
                      to={`/auction-items/${encodeURIComponent(item.id)}`}
                      className="mt-5 rounded-md border border-[var(--color-primary)]/50 px-4 py-2.5 text-center text-sm text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10"
                    >
                      Xem chi tiết vật phẩm
                    </Link>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
