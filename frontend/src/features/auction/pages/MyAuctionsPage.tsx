import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { auctionService } from '../../../services/auctionService';
import type {
  AuctionSessionListItemResponse,
  AuctionSessionStatus,
} from '../../../services/auctionService.types';
import { getApiErrorMessage } from '../../../services/apiError';
import { formatDateTime } from '../../../utils/formatDate';

const statusLabel: Record<AuctionSessionStatus, string> = {
  SCHEDULED: 'Sắp diễn ra',
  ACTIVE: 'Đang diễn ra',
  ENDED: 'Đã kết thúc',
  CANCELLED: 'Đã hủy',
};

const statusTone: Record<AuctionSessionStatus, string> = {
  SCHEDULED:
    'border-[var(--color-primary)]/50 text-[var(--color-primary)]',
  ACTIVE:
    'border-[var(--color-success-border)] text-[var(--color-success)]',
  ENDED:
    'border-[var(--color-border-strong)] text-[var(--color-text-muted)]',
  CANCELLED:
    'border-[var(--color-danger-solid)]/50 text-[var(--color-danger)]',
};

export default function MyAuctionsPage() {
  const location = useLocation();

  const [items, setItems] = useState<
    AuctionSessionListItemResponse[]
  >([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadSessions = async () => {
      try {
        setLoading(true);
        setError('');

        const result = await auctionService.getMySessions({
          page: 1,
          size: 100,
        });

        if (!cancelled) {
          setItems(result.items);
          setTotal(result.total);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(
            getApiErrorMessage(
              requestError,
              'Không thể tải các phiên đấu giá của bạn.',
            ),
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadSessions();

    return () => {
      cancelled = true;
    };
  }, []);

  const activeCount = items.filter(
    (item) => item.status === 'ACTIVE',
  ).length;

  const scheduledCount = items.filter(
    (item) => item.status === 'SCHEDULED',
  ).length;

  const endedCount = items.filter(
    (item) => item.status === 'ENDED',
  ).length;

  const created =
    (location.state as { created?: boolean } | null)?.created ??
    false;

  return (
    <div className="mx-auto max-w-7xl px-6 py-10 sm:py-14">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[var(--color-primary)]">
            Kênh bán của thành viên
          </span>

          <h1 className="mt-2 font-display text-4xl">
            Phiên đấu giá của tôi
          </h1>

          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            Theo dõi các phiên đấu giá bạn đã tạo.
          </p>
        </div>

        <Link
          to="/auctions/create"
          className="rounded-md bg-[var(--color-primary)] px-5 py-3 text-center text-sm font-semibold text-[var(--color-bg)]"
        >
          ＋ Tạo phiên mới
        </Link>
      </div>

      {created && (
        <p className="mt-6 rounded-xl border border-[var(--color-success-border)]/40 bg-[var(--color-success-bg)]/15 px-5 py-4 text-sm text-[var(--color-success)]">
          Đã tạo phiên đấu giá thành công.
        </p>
      )}

      <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          [total, 'Tổng phiên'],
          [activeCount, 'Đang diễn ra'],
          [scheduledCount, 'Sắp diễn ra'],
          [endedCount, 'Đã kết thúc'],
        ].map(([value, label]) => (
          <div
            key={label}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
          >
            <p className="font-display text-2xl text-[var(--color-text)]">
              {value}
            </p>

            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              {label}
            </p>
          </div>
        ))}
      </div>

      {loading && (
        <div className="mt-7 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] py-16 text-center">
          <p className="text-sm text-[var(--color-text-muted)]">
            Đang tải các phiên đấu giá...
          </p>
        </div>
      )}

      {!loading && error && (
        <div className="mt-7 rounded-xl border border-[var(--color-danger-solid)]/60 px-5 py-4 text-sm text-[var(--color-danger)]">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="mt-7 space-y-4">
          {items.length > 0 ? (
            items.map((session) => (
              <article
                key={session.id}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
              >
                <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[10px] ${statusTone[session.status]
                          }`}
                      >
                        {statusLabel[session.status]}
                      </span>

                      <span className="text-xs text-[var(--color-text-dim)]">
                        #{session.id.slice(0, 8)}
                      </span>
                    </div>

                    <h2 className="mt-3 font-display text-2xl">
                      {session.title}
                    </h2>

                    <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
                      {session.description ||
                        'Phiên đấu giá chưa có mô tả.'}
                    </p>

                    <div className="mt-4 grid gap-3 text-xs text-[var(--color-text-muted)] sm:grid-cols-2">
                      <span>
                        Bắt đầu
                        <strong className="mt-1 block text-[var(--color-text)]">
                          {formatDateTime(session.startTime)}
                        </strong>
                      </span>

                      <span>
                        Kết thúc
                        <strong className="mt-1 block text-[var(--color-text)]">
                          {formatDateTime(session.endTime)}
                        </strong>
                      </span>
                    </div>
                  </div>

                  <Link
                    to={`/auction-sessions/${session.id}`}
                    className="rounded-md border border-[var(--color-border-strong)] px-5 py-2.5 text-center text-sm text-[var(--color-text)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                  >
                    Xem chi tiết
                  </Link>
                </div>
              </article>
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-[var(--color-border-strong)] py-16 text-center">
              <p className="font-display text-xl">
                Bạn chưa tạo phiên đấu giá nào
              </p>

              <Link
                to="/auctions/create"
                className="mt-3 inline-block text-sm text-[var(--color-primary)]"
              >
                Tạo phiên đấu giá đầu tiên
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}