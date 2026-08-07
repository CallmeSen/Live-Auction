import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  catalogApi,
  type AdminItem,
  type AdminItemStatus,
  type AdminSession,
  type AdminSessionReviewStatus,
  type AdminSessionStatus,
} from '../../../services/serverless/catalogApi';
import { getApiErrorMessage } from '../../../services/apiError';
import { formatCurrency } from '../../../utils/formatCurrency';

const statusLabel: Record<AdminItemStatus, string> = {
  WAITING: 'Đang chờ',
  LIVE: 'Đang live',
  PAUSED: 'Tạm dừng',
  PENDING_ADMIN_APPROVAL: 'Chờ duyệt',
  SOLD: 'Đã bán',
  UNSOLD: 'Không bán',
  CANCELLED: 'Đã hủy',
};

const statusOptions: Array<{ value: AdminItemStatus | ''; label: string }> = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'PENDING_ADMIN_APPROVAL', label: 'Chờ duyệt' },
  { value: 'LIVE', label: 'Đang live' },
  { value: 'PAUSED', label: 'Tạm dừng' },
  { value: 'SOLD', label: 'Đã bán' },
  { value: 'CANCELLED', label: 'Đã hủy' },
];

const commandLabels = {
  approve: 'Duyệt',
  pause: 'Tạm dừng',
  resume: 'Tiếp tục',
  close: 'Đóng',
  cancel: 'Hủy',
} as const;

const sessionCommandLabels = {
  approve: 'Duyệt phiên',
  reject: 'Từ chối',
  cancel: 'Hủy phiên',
  close: 'Đóng phiên',
} as const;

const sessionStatusLabels: Record<AdminSessionStatus, string> = {
  DRAFT: 'Nháp', SCHEDULED: 'Đã lên lịch', LIVE: 'Đang live', COMPLETED: 'Hoàn tất', CANCELLED: 'Đã hủy',
};

export default function AdminAuctionsPage() {
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [sessionStatus, setSessionStatus] = useState<AdminSessionStatus | ''>('');
  const [reviewStatus, setReviewStatus] = useState<AdminSessionReviewStatus | ''>('PENDING');
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionPageToken, setSessionPageToken] = useState<string | undefined>();
  const [sessionNextToken, setSessionNextToken] = useState<string | null>(null);
  const [items, setItems] = useState<AdminItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<AdminItemStatus | ''>('PENDING_ADMIN_APPROVAL');
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [itemCursor, setItemCursor] = useState<string | undefined>();
  const [itemNextCursor, setItemNextCursor] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const result = await catalogApi.listItems({
          status: statusFilter || undefined,
          pageSize: 100,
          cursor: itemCursor,
        });
        if (active) {
          setItems(result.items);
          setItemNextCursor(result.nextCursor);
        }
      } catch (requestError) {
        if (active) setError(getApiErrorMessage(requestError, 'Không thể tải danh sách vật phẩm.'));
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [itemCursor, reloadKey, statusFilter]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        setSessionLoading(true);
        const result = await catalogApi.listAdminSessions({
          status: sessionStatus || undefined,
          reviewStatus: reviewStatus || undefined,
          pageSize: 60,
          paginationToken: sessionPageToken,
        });
        if (active) {
          setSessions(result.items);
          setSessionNextToken(result.nextCursor);
        }
      } catch (requestError) {
        if (active) setError(getApiErrorMessage(requestError, 'Không thể tải danh sách phiên.'));
      } finally {
        if (active) setSessionLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [reloadKey, reviewStatus, sessionPageToken, sessionStatus]);

  const visibleItems = useMemo(() => {
    const normalized = keyword.trim().toLowerCase();
    if (!normalized) return items;
    return items.filter((item) => `${item.name} ${item.description} ${item.id}`.toLowerCase().includes(normalized));
  }, [items, keyword]);

  const allowedCommands = (item: AdminItem) => {
    if (item.status === 'PENDING_ADMIN_APPROVAL' || item.status === 'WAITING') return ['approve', 'cancel'] as const;
    if (item.status === 'LIVE') return ['pause', 'close', 'cancel'] as const;
    if (item.status === 'PAUSED') return ['resume', 'close', 'cancel'] as const;
    return [] as const;
  };

  const runCommand = async (item: AdminItem, command: keyof typeof commandLabels) => {
    if (actionId) return;
    if (!window.confirm(`Xác nhận ${commandLabels[command].toLowerCase()} vật phẩm "${item.name}"?`)) return;
    setActionId(item.id);
    setError('');
    setMessage('');
    try {
      await catalogApi.commandItem(item.id, command);
      setMessage(`Đã ${commandLabels[command].toLowerCase()} vật phẩm.`);
      setItemCursor(undefined);
      setReloadKey((value) => value + 1);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Không thể thực hiện thao tác vật phẩm.'));
    } finally {
      setActionId('');
    }
  };

  const allowedSessionCommands = (session: AdminSession) => {
    const commands: Array<keyof typeof sessionCommandLabels> = [];
    if (session.reviewStatus === 'PENDING' && (session.status === 'DRAFT' || session.status === 'SCHEDULED')) {
      commands.push('approve', 'reject');
    }
    if (session.status === 'DRAFT' || session.status === 'SCHEDULED') commands.push('cancel');
    if (session.status === 'LIVE' && !session.activeItemId) commands.push('close');
    return commands;
  };

  const runSessionCommand = async (session: AdminSession, command: keyof typeof sessionCommandLabels) => {
    if (actionId) return;
    if (!window.confirm(`Xác nhận ${sessionCommandLabels[command].toLowerCase()} "${session.title}"?`)) return;
    setActionId(session.id);
    setError('');
    setMessage('');
    try {
      await catalogApi.commandSession(session.id, command);
      setMessage(`Đã ${sessionCommandLabels[command].toLowerCase()}.`);
      setSessionPageToken(undefined);
      setReloadKey((value) => value + 1);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Không thể thực hiện thao tác phiên.'));
    } finally {
      setActionId('');
    }
  };

  return (
    <section className="mx-auto max-w-7xl px-6 py-10 sm:py-14">
      <span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[var(--color-primary)]">Admin · Vật phẩm</span>
      <div className="mt-2 flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
        <div>
          <h1 className="font-display text-4xl">Kiểm duyệt vật phẩm</h1>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">Đọc catalog và gửi các item command đã có trong Stage 3.</p>
        </div>
        <p className="text-sm text-[var(--color-text-muted)]">{visibleItems.length} kết quả</p>
      </div>

      <div className="mt-7 grid gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 md:grid-cols-[1fr_220px]">
        <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Tìm theo tên hoặc mã vật phẩm" className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]" />
        <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as AdminItemStatus | ''); setItemCursor(undefined); }} className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]">
          {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>

      {error && <p className="mt-5 rounded-lg border border-[var(--color-danger-solid)]/60 p-4 text-sm text-[var(--color-danger)]">{error}</p>}
      {message && <p className="mt-5 rounded-lg border border-[var(--color-success-border)] p-4 text-sm text-[var(--color-success)]">{message}</p>}

      <section className="mt-7 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex flex-col gap-3 border-b border-[var(--color-border)] p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-display text-2xl">Kiểm duyệt phiên</h2>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">Duyệt, từ chối hoặc hủy phiên theo lifecycle server.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select aria-label="Session review status" value={reviewStatus} onChange={(event) => { setReviewStatus(event.target.value as AdminSessionReviewStatus | ''); setSessionPageToken(undefined); }} className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-xs">
              <option value="">Mọi review status</option><option value="PENDING">Chờ duyệt</option><option value="APPROVED">Đã duyệt</option><option value="REJECTED">Đã từ chối</option>
            </select>
            <select aria-label="Session lifecycle status" value={sessionStatus} onChange={(event) => { setSessionStatus(event.target.value as AdminSessionStatus | ''); setSessionPageToken(undefined); }} className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-xs">
              <option value="">Mọi lifecycle</option>{Object.entries(sessionStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
        </div>
        {sessionLoading ? <p className="p-8 text-center text-sm text-[var(--color-text-muted)]">Đang tải phiên...</p> : sessions.length === 0 ? <p className="p-8 text-center text-sm text-[var(--color-text-muted)]">Không có phiên phù hợp.</p> : (
          <div className="divide-y divide-[var(--color-border)]">
            {sessions.map((session) => <article key={session.id} className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0 flex-1"><Link to={`/auction-sessions/${session.id}`} className="text-sm font-semibold hover:text-[var(--color-primary)]">{session.title}</Link><p className="mt-2 text-xs text-[var(--color-text-dim)]">{sessionStatusLabels[session.status]} · Review {session.reviewStatus} · {session.itemCount} vật phẩm</p></div>
              <div className="flex flex-wrap gap-2">{allowedSessionCommands(session).map((command) => <button key={command} type="button" disabled={Boolean(actionId)} onClick={() => void runSessionCommand(session, command)} className="rounded-md border border-[var(--color-border-strong)] px-3 py-2 text-xs hover:border-[var(--color-primary)] disabled:opacity-50">{actionId === session.id ? 'Đang xử lý...' : sessionCommandLabels[command]}</button>)}</div>
            </article>)}
          </div>
        )}
        <div className="flex justify-end border-t border-[var(--color-border)] p-4">{sessionNextToken && <button type="button" disabled={sessionLoading} onClick={() => setSessionPageToken(sessionNextToken)} className="rounded-md border border-[var(--color-border-strong)] px-3 py-2 text-xs hover:border-[var(--color-primary)] disabled:opacity-50">Next session page</button>}</div>
      </section>

      <div className="mt-7 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        {loading ? <p className="p-8 text-center text-sm text-[var(--color-text-muted)]">Đang tải catalog...</p> : visibleItems.length === 0 ? <p className="p-8 text-center text-sm text-[var(--color-text-muted)]">Không có vật phẩm phù hợp.</p> : (
          <div className="divide-y divide-[var(--color-border)]">
            {visibleItems.map((item) => (
              <article key={item.id} className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <Link to={`/auction-items/${item.id}`} className="truncate text-sm font-semibold hover:text-[var(--color-primary)]">{item.name}</Link>
                    <span className="rounded-full border border-[var(--color-border-strong)] px-2 py-1 text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">{statusLabel[item.status]}</span>
                  </div>
                  <p className="mt-2 text-xs text-[var(--color-text-dim)]">{item.id} · Session {item.sessionId} · Giá mở {formatCurrency(Number(item.startPrice))}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {allowedCommands(item).map((command) => <button key={command} type="button" disabled={Boolean(actionId)} onClick={() => void runCommand(item, command)} className="rounded-md border border-[var(--color-border-strong)] px-3 py-2 text-xs hover:border-[var(--color-primary)] disabled:opacity-50">{actionId === item.id ? 'Đang xử lý...' : commandLabels[command]}</button>)}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
      <div className="mt-5 flex justify-end">{itemNextCursor && <button type="button" disabled={loading} onClick={() => setItemCursor(itemNextCursor)} className="rounded-md border border-[var(--color-border-strong)] px-3 py-2 text-xs hover:border-[var(--color-primary)] disabled:opacity-50">Next item page</button>}</div>
    </section>
  );
}
