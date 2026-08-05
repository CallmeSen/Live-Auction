import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import Button from '../../../components/common/Button';
import Input from '../../../components/common/Input';
import useAuth from '../../../hooks/useAuth';
import { getApiErrorMessage } from '../../../services/apiError';
import { adminService } from '../../../services/adminService';
import { userService } from '../../../services/userService';
import type { UserListItemResponse } from '../../../interfaces/user';
import { formatDateTime } from '../../../utils/formatDate';

const emptyCreateForm = { fullName: '', email: '', phone: '', password: '' };

function getAdminPasswordError(password: string): string | null {
  if (password.length < 8 || password.length > 72) return 'Mật khẩu phải có từ 8 đến 72 ký tự.';
  if (!/[A-Z]/.test(password)) return 'Mật khẩu phải có ít nhất một chữ hoa.';
  if (!/[a-z]/.test(password)) return 'Mật khẩu phải có ít nhất một chữ thường.';
  if (!/\d/.test(password)) return 'Mật khẩu phải có ít nhất một chữ số.';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Mật khẩu phải có ít nhất một ký tự đặc biệt.';
  return null;
}

export default function AdminAccountsPage() {
  const { user: currentAdmin } = useAuth();
  const [admins, setAdmins] = useState<UserListItemResponse[]>([]);
  const [form, setForm] = useState(emptyCreateForm);
  const [resetTarget, setResetTarget] = useState<UserListItemResponse | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!currentAdmin?.isPrimaryAdmin) return undefined;
    let active = true;
    userService.getUsers({ page: 1, pageSize: 100, role: 'ADMIN', sortBy: 'createdAt', sortOrder: 'asc' }).then((result) => {
      if (!active) return;
      setAdmins(result.items); setError('');
    }).catch((requestError) => { if (active) setError(getApiErrorMessage(requestError, 'Không thể tải danh sách quản trị viên.')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [currentAdmin?.isPrimaryAdmin, refreshKey]);

  if (!currentAdmin?.isPrimaryAdmin) return <Navigate to="/forbidden" replace />;

  const createAdmin = async (event: React.FormEvent) => {
    event.preventDefault();
    const passwordError = getAdminPasswordError(form.password);
    if (passwordError) { setError(passwordError); return; }
    setSubmitting(true); setError(''); setMessage('');
    try {
      await adminService.createAdminUser({ email: form.email.trim(), fullName: form.fullName.trim(), phone: form.phone.trim(), password: form.password });
      setForm(emptyCreateForm); setMessage('Đã tạo tài khoản quản trị viên phụ.'); setRefreshKey((value) => value + 1);
    } catch (requestError) { setError(getApiErrorMessage(requestError, 'Không thể tạo tài khoản quản trị viên.')); }
    finally { setSubmitting(false); }
  };

  const resetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!resetTarget) return;
    const passwordError = getAdminPasswordError(newPassword);
    if (passwordError) { setError(passwordError); return; }
    setSubmitting(true); setError(''); setMessage('');
    try {
      await adminService.resetAdminPassword(resetTarget.id, { newPassword });
      setMessage('Đã đặt lại mật khẩu cho ' + resetTarget.email + '.'); setResetTarget(null); setNewPassword('');
    } catch (requestError) { setError(getApiErrorMessage(requestError, 'Không thể đặt lại mật khẩu.')); }
    finally { setSubmitting(false); }
  };

  const toggleStatus = async (target: UserListItemResponse) => {
    const status = target.status === 'ACTIVE' ? 'BANNED' : 'ACTIVE';
    if (!window.confirm('Xác nhận thay đổi trạng thái của ' + target.email + '?')) return;
    setSubmitting(true); setError(''); setMessage('');
    try { await adminService.updateUserStatus(target.id, { status }); setRefreshKey((value) => value + 1); }
    catch (requestError) { setError(getApiErrorMessage(requestError, 'Không thể cập nhật quản trị viên.')); }
    finally { setSubmitting(false); }
  };

  return <section className="mx-auto max-w-7xl px-6 py-12">
    <span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[var(--color-primary)]">Admin gốc · Phân quyền</span>
    <h1 className="mt-2 font-display text-4xl">Quản lý quản trị viên</h1>
    <p className="mt-2 text-sm text-[var(--color-text-muted)]">Chỉ Admin gốc nhìn thấy trang này và có quyền tạo, khóa hoặc đặt lại mật khẩu cho Admin phụ.</p>

    <div className="mt-8 grid gap-6 lg:grid-cols-[380px_1fr]">
      <form onSubmit={createAdmin} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <h2 className="font-display text-2xl">Tạo Admin phụ</h2>
        <div className="mt-5 flex flex-col gap-4">
          <Input label="Họ và tên" name="fullName" required value={form.fullName} onChange={(event) => setForm((value) => ({ ...value, fullName: event.target.value }))} />
          <Input label="Email" name="email" type="email" required value={form.email} onChange={(event) => setForm((value) => ({ ...value, email: event.target.value }))} />
          <Input label="Số điện thoại" name="phone" type="tel" required value={form.phone} onChange={(event) => setForm((value) => ({ ...value, phone: event.target.value }))} />
          <Input label="Mật khẩu ban đầu" name="password" type={showPasswords ? 'text' : 'password'} required value={form.password} onChange={(event) => setForm((value) => ({ ...value, password: event.target.value }))} />
          <p className="text-xs leading-5 text-[var(--color-text-dim)]">Tối thiểu 8 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt. Ví dụ: Asdf1234!</p>
          <label className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]"><input type="checkbox" checked={showPasswords} onChange={(event) => setShowPasswords(event.target.checked)} /> Hiện mật khẩu</label>
          <Button type="submit" disabled={submitting}>{submitting ? 'Đang xử lý...' : 'Tạo tài khoản Admin'}</Button>
        </div>
      </form>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <h2 className="font-display text-2xl">Danh sách Admin</h2>
        {loading && <p className="mt-6 text-sm text-[var(--color-text-muted)]">Đang tải danh sách...</p>}
        <div className="mt-5 flex flex-col gap-3">{admins.map((admin) => <article key={admin.id} className="rounded-lg border border-[var(--color-border)] p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><div className="flex items-center gap-2"><h3 className="font-semibold">{admin.fullName}</h3>{admin.isPrimaryAdmin && <span className="rounded-full border border-[var(--color-primary)] px-2 py-0.5 text-[10px] text-[var(--color-primary)]">Admin gốc</span>}</div><p className="mt-1 text-sm text-[var(--color-text-muted)]">{admin.email} · {admin.phone || 'Chưa có SĐT'}</p><p className="mt-1 text-xs text-[var(--color-text-dim)]">Tạo lúc {formatDateTime(admin.createdAt)} · {admin.status === 'ACTIVE' ? 'Đang hoạt động' : 'Đã khóa'}</p></div>
            {!admin.isPrimaryAdmin && <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" onClick={() => { setResetTarget(admin); setNewPassword(''); }}>Đặt lại mật khẩu</Button><Button type="button" variant="secondary" disabled={submitting} className={admin.status === 'ACTIVE' ? 'border-[var(--color-danger-border)] text-[var(--color-danger)]' : 'border-[var(--color-success-border)] text-[var(--color-success)]'} onClick={() => void toggleStatus(admin)}>{admin.status === 'ACTIVE' ? 'Khóa' : 'Mở khóa'}</Button></div>}
          </div>
        </article>)}</div>
      </div>
    </div>

    {error && <p className="mt-5 rounded-lg border border-[var(--color-danger-border)] p-4 text-sm text-[var(--color-danger)]">{error}</p>}
    {message && <p className="mt-5 rounded-lg border border-[var(--color-success-border)] p-4 text-sm text-[var(--color-success)]">{message}</p>}
    {resetTarget && <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-5"><form onSubmit={resetPassword} className="w-full max-w-md rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6"><h2 className="font-display text-2xl">Đặt lại mật khẩu</h2><p className="mt-2 text-sm text-[var(--color-text-muted)]">Tài khoản: {resetTarget.email}</p><div className="mt-5"><Input label="Mật khẩu mới" name="newPassword" type={showPasswords ? 'text' : 'password'} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></div><div className="mt-6 flex justify-end gap-3"><Button type="button" variant="secondary" onClick={() => { setResetTarget(null); setNewPassword(''); }}>Hủy</Button><Button type="submit" disabled={submitting}>{submitting ? 'Đang lưu...' : 'Xác nhận'}</Button></div></form></div>}
  </section>;
}
