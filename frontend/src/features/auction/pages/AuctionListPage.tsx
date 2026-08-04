import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import useAuth from '../../../hooks/useAuth';
import { auctionSessionService } from '../../../services/auctionSessionService';
import type {
  AuctionSessionListItemResponse,
  AuctionSessionStatus,
} from '../../../interfaces/auctionSession';
import { getApiErrorMessage } from '../../../services/apiError';
import { resolveBackendAssetUrl } from '../../../utils/assetUrl';
import {
  formatDateTime,
  getTimeLeft,
} from '../../../utils/formatDate';

const PAGE_SIZE = 6;

type StatusFilter = AuctionSessionStatus | 'ALL';

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

export default function AuctionListPage() {
  const { user } = useAuth();

  const [sessions, setSessions] = useState<
    AuctionSessionListItemResponse[]
  >([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] =
    useState<StatusFilter>('ALL');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const timer = window.setTimeout(async () => {
      try {
        setLoading(true);
        setError('');

        const result = await auctionSessionService.getSessions({
          page,
          size: PAGE_SIZE,
          status: status === 'ALL' ? undefined : status,
          keyword: search.trim() || undefined,
        });

        if (!cancelled) {
          setSessions(result.items);
          setTotal(result.total);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(
            getApiErrorMessage(
              requestError,
              'Không thể tải danh sách phiên đấu giá.',
            ),
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [page, search, status]);

  const totalPages = Math.max(
    1,
    Math.ceil(total / PAGE_SIZE),
  );

  const featured =
    sessions.find(
      (session) => session.status === 'ACTIVE',
    ) ?? sessions[0];

  const updateStatus = (value: StatusFilter) => {
    setStatus(value);
    setPage(1);
  };

  return (
    <div>
      <section className="relative overflow-hidden border-b border-[var(--color-border)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(201,162,39,0.12),transparent_32%)]" />

        <div className="relative mx-auto grid max-w-7xl gap-10 px-6 py-12 lg:grid-cols-[1fr_1.08fr] lg:items-center lg:py-18">
          <div>
            <div className="flex items-center gap-3">
              <span className="h-px w-8 bg-[var(--color-primary)]" />

              <span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[var(--color-primary)]">
                Đấu giá chọn lọc mỗi ngày
              </span>
            </div>

            <h1 className="mt-5 max-w-xl font-display text-5xl leading-[1.08] text-[var(--color-text)] sm:text-6xl">
              Tìm thấy giá trị trong từng món đồ.
            </h1>

            <p className="mt-5 max-w-lg text-base leading-7 text-[var(--color-text-soft)]">
              Khám phá các phiên đấu giá được lấy trực tiếp
              từ hệ thống LiveAuction.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#auction-list"
                className="rounded-md bg-[var(--color-primary)] px-5 py-3 text-sm font-semibold text-[var(--color-bg)] hover:bg-[var(--color-primary-hover)]"
              >
                Khám phá phiên đấu giá
              </a>

              {user?.role === 'USER' && (
                <Link
                  to="/auctions/create"
                  className="rounded-md border border-[var(--color-border-strong)] px-5 py-3 text-sm font-semibold text-[var(--color-text)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                >
                  Tạo phiên đấu giá
                </Link>
              )}

              {!user && (
                <Link
                  to="/login"
                  className="rounded-md border border-[var(--color-border-strong)] px-5 py-3 text-sm font-semibold text-[var(--color-text)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                >
                  Đăng nhập để tham gia
                </Link>
              )}
            </div>

            <dl className="mt-10 grid max-w-md grid-cols-2 gap-5 border-t border-[var(--color-border)] pt-6">
              <div>
                <dt className="font-display text-2xl text-[var(--color-text)]">
                  {total}
                </dt>

                <dd className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                  Phiên phù hợp
                </dd>
              </div>

              <div>
                <dt className="font-display text-2xl text-[var(--color-text)]">
                  {sessions.filter(
                    (item) => item.status === 'ACTIVE',
                  ).length}
                </dt>

                <dd className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                  Đang diễn ra trên trang này
                </dd>
              </div>
            </dl>
          </div>

          {featured ? (
            <Link
              to={`/auction-sessions/${featured.id}`}
              className="group relative flex min-h-[360px] flex-col justify-end overflow-hidden rounded-[1.5rem] border border-[var(--color-border-strong)] bg-[var(--color-surface-alt)] p-7 sm:p-9"
            >
              {featured.primaryImageUrl && (
                <img
                  src={
                    resolveBackendAssetUrl(
                      featured.primaryImageUrl,
                    ) ?? undefined
                  }
                  alt={featured.title}
                  className="absolute inset-0 h-full w-full object-cover opacity-60 transition duration-500 group-hover:scale-105"
                />
              )}

              <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_25%,rgba(201,162,39,0.2),transparent_38%)]" />
              <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-surface-alt)] via-[var(--color-surface-alt)]/65 to-transparent" />

              <div className="relative">
                <span
                  className={`inline-block rounded-full border px-3 py-1.5 font-mono-tag text-[10px] uppercase tracking-[0.18em] ${statusTone[featured.status]
                    }`}
                >
                  {statusLabel[featured.status]}
                </span>

                <p className="mt-6 font-mono-tag text-xs uppercase tracking-[0.18em] text-[var(--color-primary)]">
                  {featured.status === 'ENDED' ||
                    featured.status === 'CANCELLED'
                    ? `Kết thúc ${formatDateTime(
                      featured.endTime,
                    )}`
                    : `Còn ${getTimeLeft(
                      featured.endTime,
                    )}`}
                </p>

                <h2 className="mt-3 font-display text-3xl text-[var(--color-text)] sm:text-4xl">
                  {featured.title}
                </h2>

                <p className="mt-4 line-clamp-3 text-sm leading-6 text-[var(--color-text-soft)]">
                  {featured.description ||
                    'Phiên đấu giá chưa có mô tả.'}
                </p>

                <div className="mt-6 flex items-center justify-between">
                  <span className="text-sm text-[var(--color-text-muted)]">
                    Người bán: {featured.sellerName}
                  </span>

                  <span className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--color-border-strong)] text-lg text-[var(--color-text)] group-hover:bg-[var(--color-primary)] group-hover:text-[var(--color-bg)]">
                    ↗
                  </span>
                </div>
              </div>
            </Link>
          ) : (
            <div className="flex min-h-[360px] items-center justify-center rounded-[1.5rem] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface-alt)] p-8 text-center">
              <p className="text-sm text-[var(--color-text-muted)]">
                Chưa có phiên đấu giá để giới thiệu.
              </p>
            </div>
          )}
        </div>
      </section>

      <section
        id="auction-list"
        className="mx-auto max-w-7xl px-6 py-14 sm:py-18"
      >
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[var(--color-primary)]">
              Danh sách phiên
            </span>

            <h2 className="mt-2 font-display text-3xl text-[var(--color-text)] sm:text-4xl">
              Tất cả phiên đấu giá
            </h2>
          </div>

          <p className="text-sm text-[var(--color-text-muted)]">
            {total} kết quả · trang {page}/{totalPages}
          </p>
        </div>

        <div className="mt-8 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Tìm theo tên phiên..."
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-4 py-3 text-sm text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-dim)] focus:border-[var(--color-primary)]"
          />

          <div className="mt-4 flex flex-wrap gap-2">
            {(
              [
                ['ALL', 'Tất cả'],
                ['SCHEDULED', 'Sắp diễn ra'],
                ['ACTIVE', 'Đang diễn ra'],
                ['ENDED', 'Đã kết thúc'],
                ['CANCELLED', 'Đã hủy'],
              ] as [StatusFilter, string][]
            ).map(([value, label]) => (
              <button
                type="button"
                key={value}
                onClick={() => updateStatus(value)}
                className={`rounded-full border px-4 py-2 text-xs ${status === value
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-bg)]'
                    : 'border-[var(--color-border-strong)] text-[var(--color-text-muted)]'
                  }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading && (
          <div className="mt-8 rounded-xl border border-[var(--color-border)] py-16 text-center">
            <p className="text-sm text-[var(--color-text-muted)]">
              Đang tải danh sách phiên đấu giá...
            </p>
          </div>
        )}

        {!loading && error && (
          <div className="mt-8 rounded-xl border border-[var(--color-danger-solid)]/60 px-5 py-4 text-sm text-[var(--color-danger)]">
            {error}
          </div>
        )}

        {!loading && !error && sessions.length > 0 && (
          <div className="mt-8 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {sessions.map((session) => (
              <article
                key={session.id}
                className="flex flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6"
              >
                <div className="flex items-center justify-between gap-3">
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[10px] ${statusTone[session.status]
                      }`}
                  >
                    {statusLabel[session.status]}
                  </span>

                  <span className="text-[10px] text-[var(--color-text-dim)]">
                    #{session.id.slice(0, 8)}
                  </span>
                </div>

                {session.primaryImageUrl ? (
                  <img
                    src={
                      resolveBackendAssetUrl(
                        session.primaryImageUrl,
                      ) ?? undefined
                    }
                    alt={session.title}
                    className="mt-5 h-44 w-full rounded-lg object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="mt-5 flex h-44 items-center justify-center rounded-lg border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface-alt)] text-xs text-[var(--color-text-dim)]">
                    Chưa có hình ảnh
                  </div>
                )}

                <h3 className="mt-5 font-display text-2xl">
                  {session.title}
                </h3>

                <p className="mt-3 line-clamp-3 flex-1 text-sm leading-6 text-[var(--color-text-muted)]">
                  {session.description ||
                    'Phiên đấu giá chưa có mô tả.'}
                </p>

                <dl className="mt-5 space-y-2 border-t border-[var(--color-border)] pt-4 text-xs">
                  <div className="flex justify-between gap-4">
                    <dt className="text-[var(--color-text-dim)]">
                      Bắt đầu
                    </dt>

                    <dd className="text-right text-[var(--color-text)]">
                      {formatDateTime(session.startTime)}
                    </dd>
                  </div>

                  <div className="flex justify-between gap-4">
                    <dt className="text-[var(--color-text-dim)]">
                      Kết thúc
                    </dt>

                    <dd className="text-right text-[var(--color-text)]">
                      {formatDateTime(session.endTime)}
                    </dd>
                  </div>

                  <div className="flex justify-between gap-4">
                    <dt className="text-[var(--color-text-dim)]">
                      Người bán
                    </dt>

                    <dd className="text-right text-[var(--color-text)]">
                      {session.sellerName}
                    </dd>
                  </div>
                </dl>

                <Link
                  to={`/auction-sessions/${session.id}`}
                  className="mt-6 rounded-md border border-[var(--color-primary)]/50 px-4 py-2.5 text-center text-sm text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-[var(--color-bg)]"
                >
                  Xem phiên đấu giá
                </Link>
              </article>
            ))}
          </div>
        )}

        {!loading &&
          !error &&
          sessions.length === 0 && (
            <div className="mt-8 rounded-xl border border-dashed border-[var(--color-border-strong)] py-16 text-center">
              <p className="font-display text-xl">
                Không tìm thấy phiên đấu giá
              </p>

              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setStatus('ALL');
                  setPage(1);
                }}
                className="mt-3 text-sm text-[var(--color-primary)]"
              >
                Xóa bộ lọc
              </button>
            </div>
          )}

        {totalPages > 1 && (
          <div className="mt-9 flex items-center justify-center gap-2">
            <button
              type="button"
              disabled={page === 1}
              onClick={() =>
                setPage((value) => value - 1)
              }
              className="rounded-md border border-[var(--color-border-strong)] px-4 py-2 text-xs disabled:opacity-40"
            >
              ← Trước
            </button>

            {Array.from(
              { length: totalPages },
              (_, index) => index + 1,
            ).map((pageNumber) => (
              <button
                type="button"
                key={pageNumber}
                onClick={() => setPage(pageNumber)}
                className={`h-9 w-9 rounded-md text-xs ${page === pageNumber
                    ? 'bg-[var(--color-primary)] text-[var(--color-bg)]'
                    : 'border border-[var(--color-border-strong)] text-[var(--color-text-muted)]'
                  }`}
              >
                {pageNumber}
              </button>
            ))}

            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() =>
                setPage((value) => value + 1)
              }
              className="rounded-md border border-[var(--color-border-strong)] px-4 py-2 text-xs disabled:opacity-40"
            >
              Sau →
            </button>
          </div>
        )}
      </section>
    </div>
  );
}