import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { AuthRole } from '../../../auth/types';
import useAuth from '../../../hooks/useAuth';
import type { CatalogApi } from '../../../services/serverless/catalogApi';
import type { AuctionItem } from '../../../services/serverless/mappers';
import { mediaUrlForKey } from '../../../services/serverless/media';
import { runtimeConfig } from '../../../config/runtime';
import { useCatalogApi } from '../../../services/serverless/useCatalogApi';
import AuctionRoomPanel from '../../auction-room/AuctionRoomPanel';
import BidPanel from '../../auction-room/BidPanel';
import { formatCountdown } from '../../auction-room/countdown';
import { useAuctionRoom } from '../../auction-room/useAuctionRoom';

type AuctionDetailPageProps = {
  catalogApi?: CatalogApi;
};

export default function AuctionDetailPage({ catalogApi }: AuctionDetailPageProps) {
  const { id } = useParams();
  const { session } = useAuth();
  const api = useCatalogApi(catalogApi);
  const [item, setItem] = useState<AuctionItem | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
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

    void api.getItem(id).then(
      (result) => {
        if (!active) return;
        setRequestId(id);
        setItem(result);
        setError(false);
        setLoading(false);
      },
      () => {
        if (!active) return;
        setRequestId(id);
        setError(true);
        setLoading(false);
      },
    );

    return () => {
      active = false;
    };
    }, [api, id, retryKey]);

  const requestMatchesRoute = Boolean(id) && requestId === id;
  const pageLoading = Boolean(id) && (loading || !requestMatchesRoute);
  const pageError = !id || (requestMatchesRoute && error);
  const pageItem = requestMatchesRoute && !loading && !error && item?.id === id
    ? item
    : null;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10 sm:py-14">
      <Link to="/auctions" className="text-sm text-[var(--color-primary)]">
        Quay lại danh sách
      </Link>

      {pageLoading && (
        <div role="status" className="py-20 text-center text-sm text-[var(--color-text-muted)]">
          Đang tải thông tin vật phẩm...
        </div>
      )}

      {!pageLoading && pageError && (
        <div role="alert" className="mt-8 border-y border-[var(--color-danger-solid)]/60 py-10 text-center">
          <p className="text-sm text-[var(--color-danger)]">
            Không thể tải thông tin vật phẩm.
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

      {!pageLoading && !pageError && pageItem && (
        <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_0.8fr]">
          <section>
            {mediaUrlForKey(runtimeConfig.mediaBaseUrl, pageItem.imageKeys[0]) && (
              <div className="mb-8 aspect-[4/3] max-w-2xl overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]">
                <img
                  src={mediaUrlForKey(runtimeConfig.mediaBaseUrl, pageItem.imageKeys[0]) ?? undefined}
                  alt={pageItem.name}
                  className="h-full w-full object-contain"
                />
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--color-text-muted)]">
              <span className="rounded-full border border-[var(--color-border-strong)] px-3 py-1">
                {pageItem.status}
              </span>
              <span>#{pageItem.sequenceNumber}</span>
              {pageItem.categoryId && <span>{pageItem.categoryId}</span>}
            </div>
            <h1 className="mt-5 font-display text-4xl text-[var(--color-text)] sm:text-5xl">
              {pageItem.name}
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-[var(--color-text-soft)]">
              {pageItem.description || 'Vật phẩm chưa có mô tả.'}
            </p>
            <dl className="mt-8 grid gap-5 border-y border-[var(--color-border)] py-6 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-[var(--color-text-dim)]">Giá khởi điểm</dt>
                <dd className="mt-2 font-display text-2xl">{pageItem.startPrice}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--color-text-dim)]">Thời lượng</dt>
                <dd className="mt-2 font-display text-2xl">{formatCountdown(pageItem.durationSeconds)}</dd>
              </div>
            </dl>
          </section>

          {pageItem.status === 'LIVE' && pageItem.live && (
            <LiveAuctionRoom
              itemId={pageItem.id}
              sessionId={pageItem.sessionId}
              catalogApi={api}
              role={session?.role}
            />
          )}
        </div>
      )}
    </main>
  );
}

type LiveAuctionRoomProps = {
  itemId: string;
  sessionId: string;
  catalogApi: CatalogApi;
  role?: AuthRole;
};

function LiveAuctionRoom({
  itemId,
  sessionId,
  catalogApi,
  role,
}: LiveAuctionRoomProps) {
  const room = useAuctionRoom({ itemId, catalogApi });
  const [minimumBidIncrement, setMinimumBidIncrement] = useState<string | null>(null);
  const [resolvedRulesSessionId, setResolvedRulesSessionId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void catalogApi.getSession(sessionId).then(
      (detail) => {
        if (!active) return;
        setMinimumBidIncrement(detail.rules?.minIncrement ?? null);
        setResolvedRulesSessionId(sessionId);
      },
      () => {
        if (!active) return;
        setMinimumBidIncrement(null);
        setResolvedRulesSessionId(sessionId);
      },
    );
    return () => {
      active = false;
    };
  }, [catalogApi, sessionId]);

  const rulesLoading = resolvedRulesSessionId !== sessionId;
  const bidControl = rulesLoading ? (
    <p role="status" className="text-xs text-[var(--color-text-muted)]">
      Đang tải bước giá...
    </p>
  ) : minimumBidIncrement ? (
    <BidPanel
      itemId={itemId}
      connectionState={room.connectionState}
      currentPrice={room.currentPrice}
      minimumBidIncrement={minimumBidIncrement}
      lastEvent={room.lastEvent}
      role={role}
      sendBid={room.sendBid}
    />
  ) : (
    <p role="alert" className="text-xs text-[var(--color-danger)]">
      Không thể tải bước giá cho phiên này.
    </p>
  );

  return (
    <AuctionRoomPanel
      connectionState={room.connectionState}
      currentPrice={room.currentPrice}
      endTime={room.endTime}
      highestBidderAlias={room.highestBidderAlias}
      bidderAlias={room.bidderAlias}
      extensionCount={room.extensionCount}
      role={role}
      onRetry={room.retry}
      bidControl={bidControl}
    />
  );
}
