import { useEffect, useState } from 'react';
import Button from '../../../components/common/Button';
import { getApiErrorMessage } from '../../../services/apiError';
import { adminService } from '../../../services/adminService';
import { userService } from '../../../services/userService';
import type { AuthUserStatus } from '../../../interfaces/auth';
import type { UserListItemResponse } from '../../../interfaces/user';
import { formatDateTime } from '../../../utils/formatDate';

const statusLabel: Record<AuthUserStatus, string> = { ACTIVE: 'Hoạt động', BANNED: 'Đã khóa' };

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserListItemResponse[]>([]);
  const [keywordDraft, setKeywordDraft] = useState('');
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | AuthUserStatus>('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    userService.getUsers({
      page,
      pageSize: 20,
      keyword: keyword || undefined,
      role: 'USER',
      status: statusFilter || undefined,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    }).then((result) => {
      if (!active) return;
      setUsers(result.items);
      setTotalPages(Math.max(result.pagination.totalPages, 1));
      setError('');
    }).catch((requestError) => {
      if (active) setError(getApiErrorMessage(requestError, 'Không thể tải danh sách người dùng.'));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [keyword, page, refreshKey, statusFilter]);

  const search = (event: React.FormEvent) => {
    event.preventDefault();
    setPage(1);
    setKeyword(keywordDraft.trim());
  };

  const toggleStatus = async (user: UserListItemResponse) => {
    const nextStatus: AuthUserStatus = user.status === 'ACTIVE' ? 'BANNED' : 'ACTIVE';
    const action = nextStatus === 'BANNED' ? 'khóa' : 'mở khóa';
    if (!window.confirm('Xác nhận ' + action + ' tài khoản ' + user.email + '?')) return;
    setUpdatingId(user.id); setError('');
    try {
      await adminService.updateUserStatus(user.id, { status: nextStatus });
      setRefreshKey((value) => value + 1);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Không thể cập nhật trạng thái tài khoản.'));
    } finally { setUpdatingId(null); }
  };

  return <section className="mx-auto max-w-7xl px-6 py-12">
    <span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[var(--color-primary)]">Admin · Người dùng</span>
    <h1 className="mt-2 font-display text-4xl">Quản lý thành viên</h1>
    <p className="mt-2 text-sm text-[var(--color-text-muted)]">Tìm kiếm, khóa hoặc mở lại tài khoản thành viên. Tài khoản Admin được quản lý ở khu vực riêng.</p>

    <form onSubmit={search} className="mt-8 grid gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 md:grid-cols-[1fr_190px_auto]">
      <input value={keywordDraft} onChange={(event) => setKeywordDraft(event.target.value)} placeholder="Email, họ tên hoặc số điện thoại" className="rounded-md border border-[var(--color-border-strong)] bg-transparent px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]" />
      <select value={statusFilter} onChange={(event) => { setPage(1); setStatusFilter(event.target.value as '' | AuthUserStatus); }} className="rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-4 py-3 text-sm">
        <option value="">Tất cả trạng thái</option><option value="ACTIVE">Hoạt động</option><option value="BANNED">Đã khóa</option>
      </select>
      <Button type="submit">Tìm kiếm</Button>
    </form>

    {error && <p className="mt-5 rounded-lg border border-[var(--color-danger-border)] p-4 text-sm text-[var(--color-danger)]">{error}</p>}
    <div className="mt-5 overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-[var(--color-border)] text-xs uppercase tracking-wider text-[var(--color-text-dim)]"><tr><th className="px-4 py-4">Họ và tên</th><th className="px-4 py-4">Email</th><th className="px-4 py-4">Số điện thoại</th><th className="px-4 py-4">Trạng thái</th><th className="px-4 py-4">Ngày tạo</th><th className="px-4 py-4">Thao tác</th></tr></thead>
        <tbody>{users.map((user) => <tr key={user.id} className="border-b border-[var(--color-border)] last:border-0">
          <td className="px-4 py-4 font-medium">{user.fullName}</td><td className="px-4 py-4 text-[var(--color-text-muted)]">{user.email}</td><td className="px-4 py-4 text-[var(--color-text-muted)]">{user.phone || '—'}</td>
          <td className="px-4 py-4"><span className={'rounded-full border px-2.5 py-1 text-xs ' + (user.status === 'ACTIVE' ? 'border-[var(--color-success-border)] text-[var(--color-success)]' : 'border-[var(--color-danger-border)] text-[var(--color-danger)]')}>{statusLabel[user.status]}</span></td>
          <td className="px-4 py-4 text-xs text-[var(--color-text-dim)]">{formatDateTime(user.createdAt)}</td>
          <td className="px-4 py-4"><Button type="button" variant="secondary" disabled={updatingId === user.id} className={user.status === 'ACTIVE' ? 'border-[var(--color-danger-border)] text-[var(--color-danger)]' : 'border-[var(--color-success-border)] text-[var(--color-success)]'} onClick={() => void toggleStatus(user)}>{updatingId === user.id ? 'Đang xử lý...' : user.status === 'ACTIVE' ? 'Khóa tài khoản' : 'Mở khóa'}</Button></td>
        </tr>)}</tbody>
      </table>
      {!loading && users.length === 0 && <p className="p-12 text-center text-sm text-[var(--color-text-muted)]">Không tìm thấy thành viên phù hợp.</p>}
      {loading && <p className="p-12 text-center text-sm text-[var(--color-text-muted)]">Đang tải danh sách...</p>}
    </div>
    <div className="mt-5 flex items-center justify-center gap-3"><Button type="button" variant="secondary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>← Trước</Button><span className="text-sm text-[var(--color-text-muted)]">Trang {page}/{totalPages}</span><Button type="button" variant="secondary" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>Sau →</Button></div>
  </section>;
}
