import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { AuctionSessionDetailResponse } from '../../../interfaces/auctionSession';
import useAuth from '../../../hooks/useAuth';
import { auctionItemService } from '../../../services/auctionItemService';
import { auctionSessionService } from '../../../services/auctionSessionService';
import { getApiErrorMessage } from '../../../services/apiError';
import { resolveBackendAssetUrl } from '../../../utils/assetUrl';
import { formatCurrency } from '../../../utils/formatCurrency';
import { formatDateTime } from '../../../utils/formatDate';

const statusLabel: Record<
  AuctionSessionDetailResponse['status'],
  string
> = {
  SCHEDULED: 'Chờ duyệt',
  ACTIVE: 'Đang diễn ra',
  ENDED: 'Đã kết thúc',
  CANCELLED: 'Đã hủy',
};

export default function AuctionSessionDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [session, setSession] =
    useState<AuctionSessionDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [deletingItemId, setDeletingItemId] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadSession = async () => {
      if (!id) {
        setError('Không tìm thấy mã phiên đấu giá.');
        setLoading(false);
        return;
      }

      try {
        const data = await auctionSessionService.getSessionById(id);
        if (!cancelled) {
          setSession(data);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            getApiErrorMessage(
              loadError,
              'Không thể tải chi tiết phiên đấu giá.',
            ),
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const approveSession = async () => {
    if (!session || session.items.length === 0) {
      setError('Phiên phải có ít nhất 1 vật phẩm mới được duyệt.');
      return;
    }

    try {
      setActionLoading(true);
      setError('');
      const result = await auctionSessionService.approveSession(session.id);
      setSession((current) =>
        current ? { ...current, status: result.status } : current,
      );
      setMessage('Đã duyệt phiên đấu giá thành công.');
    } catch (actionError) {
      setError(
        getApiErrorMessage(
          actionError,
          'Không thể duyệt phiên đấu giá.',
        ),
      );
    } finally {
      setActionLoading(false);
    }
  };

  const rejectSession = async () => {
    if (!session) {
      return;
    }

    try {
      setActionLoading(true);
      setError('');
      const result = await auctionSessionService.rejectSession(
        session.id,
        { reason: rejectReason.trim() || null },
      );
      setSession((current) =>
        current ? { ...current, status: result.status } : current,
      );
      setShowRejectForm(false);
      setMessage('Đã từ chối phiên đấu giá.');
    } catch (actionError) {
      setError(
        getApiErrorMessage(
          actionError,
          'Không thể từ chối phiên đấu giá.',
        ),
      );
    } finally {
      setActionLoading(false);
    }
  };

  const cancelSession = async () => {
    if (!session) {
      return;
    }

    try {
      setActionLoading(true);
      setError('');
      const result = await auctionSessionService.cancelSession(
        session.id,
        { reason: cancelReason.trim() || null },
      );
      setSession((current) =>
        current ? { ...current, status: result.status } : current,
      );
      setShowCancelForm(false);
      setMessage('Đã hủy phiên đấu giá.');
    } catch (actionError) {
      setError(
        getApiErrorMessage(
          actionError,
          'Không thể hủy phiên đấu giá.',
        ),
      );
    } finally {
      setActionLoading(false);
    }
  };

  const deleteItem = async (itemId: string, itemTitle: string) => {
    if (
      !window.confirm(
        `Xóa vật phẩm "${itemTitle}" khỏi phiên? Thao tác này không thể hoàn tác.`,
      )
    ) {
      return;
    }

    try {
      setDeletingItemId(itemId);
      setError('');
      await auctionItemService.deleteItem(itemId);
      setSession((current) =>
        current
          ? {
              ...current,
              items: current.items.filter((item) => item.id !== itemId),
            }
          : current,
      );
      setMessage('Đã xóa vật phẩm khỏi phiên.');
    } catch (deleteError) {
      setError(
        getApiErrorMessage(
          deleteError,
          'Không thể xóa vật phẩm.',
        ),
      );
    } finally {
      setDeletingItemId('');
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-16 text-sm text-[var(--color-text-muted)]">
        Đang tải chi tiết phiên đấu giá...
      </div>
    );
  }

  if (!session) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-16">
        <p className="rounded-xl border border-[var(--color-danger-border)] p-5 text-sm text-[var(--color-danger)]">
          {error || 'Không tìm thấy phiên đấu giá.'}
        </p>
      </div>
    );
  }

  const canReview =
    user?.role === 'ADMIN' &&
    session.status === 'SCHEDULED';
  const canCancel =
    user?.role === 'ADMIN' &&
    session.status === 'SCHEDULED';
  const canManageItems =
    user?.role === 'USER' &&
    user.id === session.seller.id &&
    session.status === 'SCHEDULED';

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 sm:py-14">
      <span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[var(--color-primary)]">
        Chi tiết phiên
      </span>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-4xl">{session.title}</h1>
        <span className="rounded-full border border-[var(--color-border-strong)] px-3 py-1 text-xs text-[var(--color-primary)]">
          {statusLabel[session.status]}
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-[var(--color-text-muted)]">
        {session.description || 'Phiên chưa có mô tả.'}
      </p>

      {message && (
        <p className="mt-5 rounded-xl border border-[var(--color-success-border)] p-4 text-sm text-[var(--color-success)]">
          {message}
        </p>
      )}
      {error && (
        <p className="mt-5 rounded-xl border border-[var(--color-danger-border)] p-4 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}

      <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Người tạo', session.seller.fullName],
          ['Bắt đầu', formatDateTime(session.startTime)],
          ['Kết thúc', formatDateTime(session.endTime)],
          [
            'Bước giá tối thiểu',
            formatCurrency(Number(session.rule.minIncrement)),
          ],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
          >
            <p className="text-xs text-[var(--color-text-dim)]">{label}</p>
            <p className="mt-2 text-sm">{value}</p>
          </div>
        ))}
      </div>

      {canReview && (
        <section className="mt-7 rounded-xl border border-[var(--color-primary)]/50 bg-[var(--color-surface)] p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <h2 className="font-display text-xl">Kiểm duyệt phiên</h2>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                Kiểm tra từng vật phẩm trước khi duyệt. Phiên rỗng không
                thể được duyệt.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                disabled={
                  actionLoading || session.items.length === 0
                }
                onClick={() => void approveSession()}
                title={
                  session.items.length === 0
                    ? 'Phiên phải có ít nhất 1 vật phẩm'
                    : undefined
                }
                className="rounded-md bg-[var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-[#0F1B14] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Duyệt phiên
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={() =>
                  setShowRejectForm((current) => !current)
                }
                className="rounded-md border border-[var(--color-danger-solid)] px-5 py-2.5 text-sm text-[var(--color-danger)] disabled:opacity-50"
              >
                Từ chối
              </button>
            </div>
          </div>

          {showRejectForm && (
            <div className="mt-5 border-t border-[var(--color-border)] pt-5">
              <textarea
                value={rejectReason}
                maxLength={500}
                onChange={(event) =>
                  setRejectReason(event.target.value)
                }
                placeholder="Nhập lý do từ chối để người tạo biết cần sửa gì..."
                className="min-h-24 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-sm outline-none focus:border-[var(--color-primary)]"
              />
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => void rejectSession()}
                className="mt-3 rounded-md bg-[var(--color-danger-solid)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                Xác nhận từ chối
              </button>
            </div>
          )}
        </section>
      )}

      {canCancel && (
        <section className="mt-7 rounded-xl border border-[var(--color-danger-solid)]/60 bg-[var(--color-surface)] p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <h2
                id="cancel-scheduled-session-title"
                className="font-display text-xl"
              >
                Hủy phiên đã duyệt
              </h2>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                Admin chỉ được hủy phiên sắp diễn ra và chưa tới giờ bắt đầu.
              </p>
            </div>
            <button
              type="button"
              disabled={actionLoading}
              onClick={() =>
                setShowCancelForm((current) => !current)
              }
              className="rounded-md border border-[var(--color-danger-solid)] px-5 py-2.5 text-sm text-[var(--color-danger)] disabled:opacity-50"
            >
              Hủy phiên
            </button>
          </div>

          {showCancelForm && (
            <div className="mt-5 border-t border-[var(--color-border)] pt-5">
              <textarea
                value={cancelReason}
                maxLength={500}
                onChange={(event) =>
                  setCancelReason(event.target.value)
                }
                placeholder="Nhập lý do hủy để người tạo biết..."
                className="min-h-24 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-sm outline-none focus:border-[var(--color-primary)]"
              />
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => void cancelSession()}
                className="mt-3 rounded-md bg-[var(--color-danger-solid)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                Xác nhận hủy phiên
              </button>
            </div>
          )}
        </section>
      )}

      <div className="mt-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h2 className="font-display text-2xl">Vật phẩm trong phiên</h2>
          <p className="mt-2 max-w-3xl text-sm text-[var(--color-text-muted)]">
            Khi phiên còn chờ duyệt, chủ phiên được thêm, sửa hoặc xóa
            vật phẩm. Sau khi admin duyệt, danh sách vật phẩm sẽ bị khóa.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[var(--color-text-muted)]">
            {session.items.length} vật phẩm
          </span>
          {canManageItems && (
            <Link
              to={`/auction-sessions/${session.id}/items/create`}
              className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-[var(--color-bg)]"
            >
              + Thêm vật phẩm
            </Link>
          )}
        </div>
      </div>

      {!canManageItems && user?.id === session.seller.id && (
        <p className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-text-muted)]">
          Phiên đã rời trạng thái chờ duyệt nên vật phẩm đã bị khóa,
          không thể thêm, sửa hoặc xóa.
        </p>
      )}

      {session.items.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-[var(--color-border-strong)] py-14 text-center">
          <p className="text-sm text-[var(--color-text-muted)]">
            Phiên chưa có vật phẩm nào
          </p>
        </div>
      ) : (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {session.items.map((item) => (
            <article
              key={item.id}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
            >
              <div className="flex items-start gap-4">
                {item.primaryImageUrl ? (
                  <img
                    src={
                      resolveBackendAssetUrl(item.primaryImageUrl) ??
                      undefined
                    }
                    alt={item.title}
                    className="h-20 w-24 rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex h-20 w-24 items-center justify-center rounded-lg bg-[var(--color-surface-alt)] text-xs text-[var(--color-text-dim)]">
                    Chưa có ảnh
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <span className="text-[10px] text-[var(--color-primary)]">
                    {item.status}
                  </span>
                  <h3 className="mt-1 font-display text-lg">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                    Hiện tại:{' '}
                    <strong className="text-[var(--color-primary)]">
                      {formatCurrency(Number(item.currentPrice))}
                    </strong>
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-4 text-sm">
                <Link
                  to={`/auction-items/${item.id}`}
                  className="text-[var(--color-primary)]"
                >
                  Xem vật phẩm →
                </Link>
                {canManageItems && (
                  <>
                    <Link
                      to={`/auction-items/${item.id}/edit`}
                      className="text-[var(--color-primary)]"
                    >
                      Sửa
                    </Link>
                    <button
                      type="button"
                      disabled={deletingItemId === item.id}
                      onClick={() =>
                        void deleteItem(item.id, item.title)
                      }
                      className="text-[var(--color-danger)] disabled:opacity-50"
                    >
                      {deletingItemId === item.id
                        ? 'Đang xóa...'
                        : 'Xóa'}
                    </button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
