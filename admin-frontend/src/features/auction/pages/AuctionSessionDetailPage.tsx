import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { catalogApi, type AdminSessionDetail } from '../../../services/serverless/catalogApi';
import { getApiErrorMessage } from '../../../services/apiError';

export default function AuctionSessionDetailPage() {
  const { id } = useParams();
  const [detail, setDetail] = useState<AdminSessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    if (!id) {
      return () => { active = false; };
    }
    void catalogApi.getAdminSession(id).then((result) => {
      if (active) setDetail(result);
    }).catch((requestError) => {
      if (active) setError(getApiErrorMessage(requestError, 'Không thể tải phiên đấu giá.'));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [id]);

  const allowedCommands = () => {
    if (!detail) return [] as const;
    if (detail.session.reviewStatus === 'PENDING' && (detail.session.status === 'DRAFT' || detail.session.status === 'SCHEDULED')) return ['approve', 'reject', 'cancel'] as const;
    if (detail.session.status === 'DRAFT' || detail.session.status === 'SCHEDULED') return ['cancel'] as const;
    if (detail.session.status === 'LIVE' && !detail.session.activeItemId) return ['close'] as const;
    return [] as const;
  };

  const runCommand = async (command: 'approve' | 'reject' | 'cancel' | 'close') => {
    if (!id || !window.confirm(`Xác nhận thao tác ${command} với phiên này?`)) return;
    setActionLoading(true);
    setError('');
    setMessage('');
    try {
      await catalogApi.commandSession(id, command);
      setMessage('Đã thực hiện thao tác phiên.');
      setDetail(await catalogApi.getAdminSession(id));
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Không thể thực hiện thao tác phiên.'));
    } finally {
      setActionLoading(false);
    }
  };

  if (!id) return <section className="mx-auto max-w-5xl px-6 py-24 text-center"><h1 className="font-display text-3xl">Không tìm thấy mã phiên đấu giá</h1><Link to="/admin/auctions" className="mt-5 inline-block text-sm text-[var(--color-primary)]">Quay về kiểm duyệt</Link></section>;
  if (loading) return <p className="mx-auto max-w-5xl px-6 py-24 text-center text-sm text-[var(--color-text-muted)]">Đang tải phiên...</p>;
  if (error || !detail) return <section className="mx-auto max-w-5xl px-6 py-24 text-center"><h1 className="font-display text-3xl">Không thể hiển thị phiên</h1><p className="mt-3 text-sm text-[var(--color-danger)]">{error || 'Không tìm thấy phiên.'}</p><Link to="/admin/auctions" className="mt-5 inline-block text-sm text-[var(--color-primary)]">Quay về kiểm duyệt</Link></section>;

  return (
    <section className="mx-auto max-w-5xl px-6 py-10 sm:py-14">
      <Link to="/admin/auctions" className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)]">← Quay lại kiểm duyệt</Link>
      <div className="mt-7 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-7">
        <span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[var(--color-primary)]">Session {detail.session.id}</span>
        <h1 className="mt-2 font-display text-4xl">{detail.session.title}</h1>
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">{detail.session.description || 'Không có mô tả.'}</p>
        <div className="mt-6 flex flex-wrap gap-3 text-xs text-[var(--color-text-muted)]"><span className="rounded-full border border-[var(--color-border-strong)] px-3 py-1">{detail.session.status}</span><span>Review {detail.session.reviewStatus}</span><span>{detail.items.length} vật phẩm trong response</span></div>
        {message && <p className="mt-6 rounded-lg border border-[var(--color-success-border)] p-3 text-sm text-[var(--color-success)]">{message}</p>}
        {error && <p className="mt-6 rounded-lg border border-[var(--color-danger-border)] p-3 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="mt-6 flex flex-wrap gap-2">{allowedCommands().map((command) => <button key={command} type="button" disabled={actionLoading} onClick={() => void runCommand(command)} className="rounded-md border border-[var(--color-border-strong)] px-4 py-2 text-sm hover:border-[var(--color-primary)] disabled:opacity-50">{actionLoading ? 'Đang xử lý...' : command}</button>)}</div>
        <div className="mt-8 border-t border-[var(--color-border)] pt-6"><h2 className="font-display text-2xl">Vật phẩm</h2><div className="mt-4 space-y-3">{detail.items.length > 0 ? detail.items.map((item) => <Link key={item.id} to={`/auction-items/${item.id}`} className="flex items-center justify-between rounded-lg border border-[var(--color-border)] p-4 hover:border-[var(--color-primary)]"><span className="truncate text-sm">{item.name}</span><span className="ml-4 text-xs text-[var(--color-text-muted)]">{item.status}</span></Link>) : <p className="py-6 text-sm text-[var(--color-text-muted)]">Phiên chưa có vật phẩm.</p>}</div></div>
      </div>
    </section>
  );
}
