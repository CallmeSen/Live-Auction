import { type FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type {
  AuctionSessionListItemResponse,
  AuctionSessionStatus,
} from '../../../interfaces/auctionSession';
import type { CategoryResponse } from '../../../interfaces/category';
import { auctionSessionService } from '../../../services/auctionSessionService';
import { categoryService } from '../../../services/categoryService';
import { getApiErrorMessage } from '../../../services/apiError';
import { formatDateTime } from '../../../utils/formatDate';

const PAGE_SIZE = 10;

const statusLabel: Record<AuctionSessionStatus, string> = {
  PENDING_APPROVAL: 'Chờ duyệt',
  SCHEDULED: 'Sắp diễn ra',
  ACTIVE: 'Đang diễn ra',
  REJECTED: 'Đã từ chối',
  ENDED: 'Đã kết thúc',
  CANCELLED: 'Đã hủy',
};

const statusOptions: Array<{
  value: AuctionSessionStatus | '';
  label: string;
}> = [
  { value: '', label: 'Tất cả' },
  { value: 'PENDING_APPROVAL', label: 'Chờ duyệt' },
  { value: 'SCHEDULED', label: 'Sắp diễn ra' },
  { value: 'ACTIVE', label: 'Đang diễn ra' },
  { value: 'ENDED', label: 'Đã kết thúc' },
  { value: 'REJECTED', label: 'Đã từ chối' },
  { value: 'CANCELLED', label: 'Đã hủy' },
];

export default function AdminAuctionsPage() {
  const [sessions, setSessions] = useState<
    AuctionSessionListItemResponse[]
  >([]);
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [draftKeyword, setDraftKeyword] = useState('');
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] =
    useState<AuctionSessionStatus | ''>('PENDING_APPROVAL');
  const [categoryId, setCategoryId] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [rejectTarget, setRejectTarget] =
    useState<AuctionSessionListItemResponse | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [cancelTarget, setCancelTarget] =
    useState<AuctionSessionListItemResponse | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadCategories = async () => {
      try {
        const result = await categoryService.getCategories({
          page: 1,
          size: 100,
          status: 'ACTIVE',
        });

        if (!cancelled) {
          setCategories(result.items);
        }
      } catch {
        if (!cancelled) {
          setCategories([]);
        }
      }
    };

    void loadCategories();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadSessions = async () => {
      try {
        setLoading(true);
        setError('');

        const result = await auctionSessionService.getAdminSessions({
          page,
          size: PAGE_SIZE,
          status: statusFilter || undefined,
          keyword: keyword || undefined,
          categoryId: categoryId || undefined,
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
    };

    void loadSessions();

    return () => {
      cancelled = true;
    };
  }, [categoryId, keyword, page, reloadKey, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setKeyword(draftKeyword.trim());
  };

  const approveSession = async (sessionId: string) => {
    try {
      setActionId(sessionId);
      setError('');
      setMessage('');
      await auctionSessionService.approveSession(sessionId);
      setMessage('Đã duyệt phiên đấu giá thành công.');
      setReloadKey((current) => current + 1);
    } catch (requestError) {
      setError(
        getApiErrorMessage(
          requestError,
          'Không thể duyệt phiên đấu giá.',
        ),
      );
    } finally {
      setActionId('');
    }
  };

  const rejectSession = async () => {
    if (!rejectTarget) {
      return;
    }

    try {
      setActionId(rejectTarget.id);
      setError('');
      setMessage('');
      await auctionSessionService.rejectSession(rejectTarget.id, {
        reason: rejectReason.trim() || null,
      });
      setRejectTarget(null);
      setRejectReason('');
      setMessage('Đã từ chối phiên đấu giá.');
      setReloadKey((current) => current + 1);
    } catch (requestError) {
      setError(
        getApiErrorMessage(
          requestError,
          'Không thể từ chối phiên đấu giá.',
        ),
      );
    } finally {
      setActionId('');
    }
  };

  const cancelSession = async () => {
    if (!cancelTarget) {
      return;
    }

    try {
      setActionId(cancelTarget.id);
      setError('');
      setMessage('');
      await auctionSessionService.cancelSession(cancelTarget.id, {
        reason: cancelReason.trim() || null,
      });
      setCancelTarget(null);
      setCancelReason('');
      setMessage('Đã hủy phiên đấu giá.');
      setReloadKey((current) => current + 1);
    } catch (requestError) {
      setError(
        getApiErrorMessage(
          requestError,
          'Không thể hủy phiên đấu giá.',
        ),
      );
    } finally {
      setActionId('');
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-10 sm:py-14">
      <span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[var(--color-primary)]">
        Admin · Phiên đấu giá
      </span>

      <div className="mt-2 flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
        <div>
          <h1 className="font-display text-4xl">
            Quản lý phiên đấu giá
          </h1>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            Duyệt phiên mới và theo dõi toàn bộ vòng đời phiên đấu giá.
          </p>
        </div>
        <p className="text-sm text-[var(--color-text-muted)]">
          {total} kết quả
        </p>
      </div>

      <section className="mt-7 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <form
          onSubmit={submitSearch}
          className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_auto]"
        >
          <input
            value={draftKeyword}
            onChange={(event) => setDraftKeyword(event.target.value)}
            placeholder="Tìm theo tên hoặc mô tả phiên..."
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
          />
          <select
            value={categoryId}
            onChange={(event) => {
              setCategoryId(event.target.value);
              setPage(1);
            }}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
          >
            <option value="">Tất cả danh mục</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md bg-[var(--color-primary)] px-6 py-3 text-sm font-semibold text-[#0F1B14]"
          >
            Tìm kiếm
          </button>
        </form>

        <div className="mt-4 flex flex-wrap gap-2">
          {statusOptions.map((option) => (
            <button
              key={option.value || 'ALL'}
              type="button"
              onClick={() => {
                setStatusFilter(option.value);
                setPage(1);
              }}
              className={
                'rounded-full border px-4 py-2 text-xs transition ' +
                (statusFilter === option.value
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[#0F1B14]'
                  : 'border-[var(--color-border-strong)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)]')
              }
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      {message && (
        <div className="mt-5 rounded-xl border border-[var(--color-success-border)] px-5 py-4 text-sm text-[var(--color-success)]">
          {message}
        </div>
      )}

      {error && (
        <div className="mt-5 rounded-xl border border-[var(--color-danger-solid)]/60 px-5 py-4 text-sm text-[var(--color-danger)]">
          {error}
        </div>
      )}

      <div className="relative mt-5 min-h-40 space-y-4">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-start justify-center rounded-xl bg-[var(--color-bg)]/75 pt-14 text-sm text-[var(--color-text-muted)] backdrop-blur-[1px]">
            Đang tải danh sách phiên...
          </div>
        )}

        {!loading && sessions.length === 0 && (
          <div className="rounded-xl border border-dashed border-[var(--color-border-strong)] py-16 text-center">
            <p className="text-sm text-[var(--color-text-muted)]">
              Không tìm thấy phiên đấu giá phù hợp.
            </p>
          </div>
        )}

        {sessions.map((session) => (
          <article
            key={session.id}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
          >
            <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
              <div className="min-w-0">
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
                  Người tạo: {session.sellerName}
                </p>
                <p className="mt-3 text-xs text-[var(--color-text-dim)]">
                  {formatDateTime(session.startTime)} →{' '}
                  {formatDateTime(session.endTime)}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link
                  to={'/auction-sessions/' + session.id}
                  className="rounded-md border border-[var(--color-border-strong)] px-5 py-2.5 text-center text-sm hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                >
                  Xem chi tiết
                </Link>

                {session.status === 'PENDING_APPROVAL' && (
                  <>
                    <button
                      type="button"
                      disabled={actionId === session.id}
                      onClick={() => void approveSession(session.id)}
                      className="rounded-md bg-[var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-[#0F1B14] disabled:opacity-50"
                    >
                      {actionId === session.id ? 'Đang xử lý...' : 'Duyệt'}
                    </button>
                    <button
                      type="button"
                      disabled={actionId === session.id}
                      onClick={() => {
                        setRejectTarget(session);
                        setRejectReason('');
                      }}
                      className="rounded-md border border-[var(--color-danger-solid)] px-5 py-2.5 text-sm text-[var(--color-danger)] disabled:opacity-50"
                    >
                      Từ chối
                    </button>
                  </>
                )}

                {session.status === 'SCHEDULED' && (
                  <button
                    type="button"
                    disabled={actionId === session.id}
                    onClick={() => {
                      setCancelTarget(session);
                      setCancelReason('');
                    }}
                    className="rounded-md border border-[var(--color-danger-solid)] px-5 py-2.5 text-sm text-[var(--color-danger)] disabled:opacity-50"
                  >
                    Hủy phiên
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>

      {!loading && totalPages > 1 && (
        <div className="mt-7 flex items-center justify-center gap-3">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm disabled:opacity-40"
          >
            ← Trước
          </button>
          <span className="text-sm text-[var(--color-text-muted)]">
            Trang {page}/{totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() =>
              setPage((current) => Math.min(totalPages, current + 1))
            }
            className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm disabled:opacity-40"
          >
            Sau →
          </button>
        </div>
      )}

      {rejectTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reject-session-title"
        >
          <div className="w-full max-w-lg rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-2xl">
            <h2 id="reject-session-title" className="font-display text-2xl">
              Từ chối phiên đấu giá
            </h2>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">
              {rejectTarget.title}
            </p>
            <label className="mt-5 block text-xs uppercase tracking-wider text-[var(--color-text-dim)]">
              Lý do
              <textarea
                value={rejectReason}
                maxLength={500}
                onChange={(event) => setRejectReason(event.target.value)}
                placeholder="Cho người tạo biết lý do cần chỉnh sửa..."
                className="mt-2 min-h-28 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-sm normal-case tracking-normal outline-none focus:border-[var(--color-primary)]"
              />
            </label>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setRejectTarget(null)}
                className="rounded-md border border-[var(--color-border)] px-5 py-2.5 text-sm"
              >
                Đóng
              </button>
              <button
                type="button"
                disabled={actionId === rejectTarget.id}
                onClick={() => void rejectSession()}
                className="rounded-md bg-[var(--color-danger-solid)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                Xác nhận từ chối
              </button>
            </div>
          </div>
        </div>
      )}

      {cancelTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-session-title"
        >
          <div className="w-full max-w-lg rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-2xl">
            <h2 id="cancel-session-title" className="font-display text-2xl">
              Hủy phiên đã duyệt
            </h2>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">
              Chỉ phiên sắp diễn ra mới có thể hủy: {cancelTarget.title}
            </p>
            <label className="mt-5 block text-xs uppercase tracking-wider text-[var(--color-text-dim)]">
              Lý do
              <textarea
                value={cancelReason}
                maxLength={500}
                onChange={(event) => setCancelReason(event.target.value)}
                placeholder="Cho người tạo biết lý do phiên bị hủy..."
                className="mt-2 min-h-28 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-sm normal-case tracking-normal outline-none focus:border-[var(--color-primary)]"
              />
            </label>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                className="rounded-md border border-[var(--color-border)] px-5 py-2.5 text-sm"
              >
                Đóng
              </button>
              <button
                type="button"
                disabled={actionId === cancelTarget.id}
                onClick={() => void cancelSession()}
                className="rounded-md bg-[var(--color-danger-solid)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                Xác nhận hủy phiên
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
