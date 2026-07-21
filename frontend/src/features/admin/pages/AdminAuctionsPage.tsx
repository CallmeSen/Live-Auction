import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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

export default function AdminAuctionsPage() {
  const [sessions, setSessions] = useState<
    AuctionSessionListItemResponse[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadSessions = async () => {
      try {
        setLoading(true);
        setError('');

        const result = await auctionService.getSessions({
          page: 1,
          size: 100,
        });

        if (!cancelled) {
          setSessions(result.items);
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
    };

    void loadSessions();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-6 py-10 sm:py-14">
      <span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[var(--color-primary)]">
        Admin · Phiên đấu giá
      </span>

      <h1 className="mt-2 font-display text-4xl">
        Quản lý phiên đấu giá
      </h1>

      <p className="mt-2 text-sm text-[var(--color-text-muted)]">
        Danh sách được lấy trực tiếp từ backend.
      </p>

      <div className="mt-7 rounded-xl border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10 px-5 py-4 text-sm text-[var(--color-primary-hover)]">
        Backend hiện chưa có API duyệt hoặc từ chối phiên.
        Chức năng kiểm duyệt sẽ được bổ sung sau khi backend
        cung cấp endpoint và trạng thái phê duyệt.
      </div>

      {loading && (
        <div className="mt-7 rounded-xl border border-[var(--color-border)] py-16 text-center">
          <p className="text-sm text-[var(--color-text-muted)]">
            Đang tải danh sách phiên...
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
          {sessions.length > 0 ? (
            sessions.map((session) => (
              <article
                key={session.id}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
              >
                <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-[var(--color-border-strong)] px-2.5 py-1 text-[10px] text-[var(--color-primary)]">
                        {statusLabel[session.status]}
                      </span>

                      <span className="text-xs text-[var(--color-text-dim)]">
                        #{session.id.slice(0, 8)}
                      </span>
                    </div>

                    <h2 className="mt-3 font-display text-2xl">
                      {session.title}
                    </h2>

                    <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                      Người bán: {session.sellerName}
                    </p>

                    <p className="mt-3 text-xs text-[var(--color-text-dim)]">
                      {formatDateTime(session.startTime)} →{' '}
                      {formatDateTime(session.endTime)}
                    </p>
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
              <p className="text-sm text-[var(--color-text-muted)]">
                Chưa có phiên đấu giá nào.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}