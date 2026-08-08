import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { catalogApi, type AdminItem, type AdminItemStatus } from '../../../services/serverless/catalogApi';
import { getApiErrorMessage } from '../../../services/apiError';
import { formatCurrency } from '../../../utils/formatCurrency';

const statusLabel: Record<AdminItemStatus, string> = {
  WAITING: 'Đang chờ', LIVE: 'Đang live', PAUSED: 'Tạm dừng',
  PENDING_ADMIN_APPROVAL: 'Chờ duyệt', SOLD: 'Đã bán', UNSOLD: 'Không bán', CANCELLED: 'Đã hủy',
};

export default function AuctionDetailPage() {
  const { id } = useParams();
  const [item, setItem] = useState<AdminItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    if (!id) {
      return () => { active = false; };
    }
    void catalogApi.getItem(id).then((result) => {
      if (active) setItem(result);
    }).catch((requestError) => {
      if (active) setError(getApiErrorMessage(requestError, 'Không thể tải thông tin vật phẩm.'));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [id]);

  const allowedCommands = (value: AdminItem) => {
    if (value.status === 'PENDING_ADMIN_APPROVAL' || value.status === 'WAITING') return ['approve', 'cancel'] as const;
    if (value.status === 'LIVE') return ['pause', 'close', 'cancel'] as const;
    if (value.status === 'PAUSED') return ['resume', 'close', 'cancel'] as const;
    return [] as const;
  };

  const runCommand = async (command: 'approve' | 'pause' | 'resume' | 'close' | 'cancel') => {
    if (!item || !window.confirm(`Xác nhận thao tác ${command} với vật phẩm này?`)) return;
    setActionLoading(true);
    setError('');
    setMessage('');
    try {
      await catalogApi.commandItem(item.id, command);
      setMessage('Đã thực hiện thao tác.');
      setItem(await catalogApi.getItem(item.id));
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Không thể thực hiện thao tác.'));
    } finally {
      setActionLoading(false);
    }
  };

  if (!id) return <section className="mx-auto max-w-5xl px-6 py-24 text-center"><h1 className="font-display text-3xl">Không tìm thấy mã vật phẩm</h1><Link to="/admin/auctions" className="mt-5 inline-block text-sm text-[var(--color-primary)]">Quay về kiểm duyệt</Link></section>;
  if (loading) return <p className="mx-auto max-w-5xl px-6 py-24 text-center text-sm text-[var(--color-text-muted)]">Đang tải vật phẩm...</p>;
  if (error || !item) return <section className="mx-auto max-w-5xl px-6 py-24 text-center"><h1 className="font-display text-3xl">Không thể hiển thị vật phẩm</h1><p className="mt-3 text-sm text-[var(--color-danger)]">{error || 'Không tìm thấy vật phẩm.'}</p><Link to="/admin/auctions" className="mt-5 inline-block text-sm text-[var(--color-primary)]">Quay về kiểm duyệt</Link></section>;

  return (
    <section className="mx-auto max-w-5xl px-6 py-10 sm:py-14">
      <Link to="/admin/auctions" className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)]">← Quay lại kiểm duyệt</Link>
      <div className="mt-7 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-7">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
          <div><span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[var(--color-primary)]">Item {item.id}</span><h1 className="mt-2 font-display text-4xl">{item.name}</h1><p className="mt-2 text-sm text-[var(--color-text-muted)]">{item.description || 'Không có mô tả.'}</p></div>
          <span className="rounded-full border border-[var(--color-border-strong)] px-3 py-1 text-xs">{statusLabel[item.status]}</span>
        </div>
        <dl className="mt-8 grid gap-5 border-t border-[var(--color-border)] pt-6 sm:grid-cols-3">
          <div><dt className="text-xs text-[var(--color-text-dim)]">Session</dt><dd className="mt-2 break-all text-sm">{item.sessionId}</dd></div>
          <div><dt className="text-xs text-[var(--color-text-dim)]">Giá mở</dt><dd className="mt-2 text-sm">{formatCurrency(Number(item.startPrice))}</dd></div>
          <div><dt className="text-xs text-[var(--color-text-dim)]">Thời lượng</dt><dd className="mt-2 text-sm">{item.durationSeconds}s</dd></div>
        </dl>
        {message && <p className="mt-6 rounded-lg border border-[var(--color-success-border)] p-3 text-sm text-[var(--color-success)]">{message}</p>}
        {error && <p className="mt-6 rounded-lg border border-[var(--color-danger-border)] p-3 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="mt-7 flex flex-wrap gap-2">{allowedCommands(item).map((command) => <button key={command} type="button" disabled={actionLoading} onClick={() => void runCommand(command)} className="rounded-md border border-[var(--color-border-strong)] px-4 py-2 text-sm hover:border-[var(--color-primary)] disabled:opacity-50">{actionLoading ? 'Đang xử lý...' : command}</button>)}</div>
      </div>
    </section>
  );
}
