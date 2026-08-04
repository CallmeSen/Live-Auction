import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import useAuth from '../../../hooks/useAuth';
import type { CatalogApi } from '../../../services/serverless/catalogApi';
import type { AuctionSession, SessionStatus } from '../../../services/serverless/mappers';
import { useCatalogApi } from '../../../services/serverless/useCatalogApi';

const PAGE_SIZE = 6;

const statusLabel: Record<SessionStatus, string> = {
  DRAFT: 'Bản nháp',
  SCHEDULED: 'Sắp diễn ra',
  LIVE: 'Đang diễn ra',
  COMPLETED: 'Đã kết thúc',
  CANCELLED: 'Đã hủy',
};

const statusTone: Record<SessionStatus, string> = {
  DRAFT: 'border-[var(--color-border-strong)] text-[var(--color-text-muted)]',
  SCHEDULED: 'border-[var(--color-primary)]/50 text-[var(--color-primary)]',
  LIVE: 'border-[var(--color-success-border)] text-[var(--color-success)]',
  COMPLETED: 'border-[var(--color-border-strong)] text-[var(--color-text-muted)]',
  CANCELLED: 'border-[var(--color-danger-solid)]/50 text-[var(--color-danger)]',
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

type AuctionListPageProps = {
  catalogApi?: CatalogApi;
};

export default function AuctionListPage({ catalogApi }: AuctionListPageProps) {
  const { session } = useAuth();
  const api = useCatalogApi(catalogApi);
  const [sessions, setSessions] = useState<AuctionSession[]>([]);
  const [cursorStack, setCursorStack] = useState<Array<string | undefined>>([
    undefined,
  ]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const cursor = cursorStack[cursorStack.length - 1];

  useEffect(() => {
    let active = true;

    void api.listSessions({
      pageSize: PAGE_SIZE,
      ...(cursor === undefined ? {} : { cursor }),
    }).then(
      (result) => {
        if (!active) return;
        setSessions(result.items);
        setNextCursor(result.nextCursor);
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
  }, [api, cursor, retryKey]);

  return (
    <div>
      <section className="border-b border-[var(--color-border)]">
        <div className="mx-auto max-w-7xl px-6 py-12 sm:py-16">
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
            <div>
              <p className="font-mono-tag text-xs uppercase text-[var(--color-primary)]">
                Danh mục trực tiếp
              </p>
              <h1 className="mt-3 max-w-3xl font-display text-4xl leading-tight text-[var(--color-text)] sm:text-5xl">
                Phiên đấu giá
              </h1>
            </div>

            {session?.role === 'SELLER' && (
              <Link
                to="/auctions/create"
                className="rounded-md bg-[var(--color-primary)] px-5 py-3 text-sm font-semibold text-[var(--color-bg)]"
              >
                Tạo phiên đấu giá
              </Link>
            )}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-12">
        {loading && (
          <div role="status" className="py-16 text-center text-sm text-[var(--color-text-muted)]">
            Đang tải danh sách phiên đấu giá...
          </div>
        )}

        {!loading && error && (
          <div role="alert" className="border-y border-[var(--color-danger-solid)]/60 py-8 text-center">
            <p className="text-sm text-[var(--color-danger)]">
              Không thể tải danh sách phiên đấu giá.
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

        {!loading && !error && sessions.length === 0 && (
          <div className="border-y border-dashed border-[var(--color-border-strong)] py-16 text-center">
            <p className="font-display text-xl">Chưa có phiên đấu giá.</p>
          </div>
        )}

        {!loading && !error && sessions.length > 0 && (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {sessions.map((auctionSession) => (
              <article
                key={auctionSession.id}
                className="flex min-h-72 flex-col rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className={`rounded-full border px-2.5 py-1 text-[10px] ${statusTone[auctionSession.status]}`}>
                    {statusLabel[auctionSession.status]}
                  </span>
                  <span className="text-xs text-[var(--color-text-dim)]">
                    {auctionSession.itemCount} vật phẩm
                  </span>
                </div>
                <h2 className="mt-6 font-display text-2xl text-[var(--color-text)]">
                  {auctionSession.title}
                </h2>
                <p className="mt-3 line-clamp-3 flex-1 text-sm leading-6 text-[var(--color-text-muted)]">
                  {auctionSession.description || 'Phiên chưa có mô tả.'}
                </p>
                <p className="mt-5 border-t border-[var(--color-border)] pt-4 text-xs text-[var(--color-text-muted)]">
                  Bắt đầu: {formatEpoch(auctionSession.startTime)}
                </p>
                <Link
                  to={`/auction-sessions/${encodeURIComponent(auctionSession.id)}`}
                  className="mt-5 rounded-md border border-[var(--color-primary)]/50 px-4 py-2.5 text-center text-sm text-[var(--color-primary)]"
                >
                  Xem phiên đấu giá
                </Link>
              </article>
            ))}
          </div>
        )}

        {!loading && !error && (cursorStack.length > 1 || nextCursor !== null) && (
          <nav aria-label="Phân trang" className="mt-9 flex justify-center gap-3">
            <button
              type="button"
              disabled={cursorStack.length === 1}
              onClick={() => {
                setLoading(true);
                setError(false);
                setCursorStack((current) => current.slice(0, -1));
              }}
              className="rounded-md border border-[var(--color-border-strong)] px-4 py-2 text-sm disabled:opacity-40"
            >
              Trang trước
            </button>
            <button
              type="button"
              disabled={nextCursor === null}
              onClick={() => {
                if (nextCursor !== null) {
                  setLoading(true);
                  setError(false);
                  setCursorStack((current) => [...current, nextCursor]);
                }
              }}
              className="rounded-md border border-[var(--color-border-strong)] px-4 py-2 text-sm disabled:opacity-40"
            >
              Trang sau
            </button>
          </nav>
        )}
      </section>
    </div>
  );
}
