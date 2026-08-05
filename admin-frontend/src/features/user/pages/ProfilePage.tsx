import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../../../components/common/Button';
import Input from '../../../components/common/Input';
import { useTheme } from '../../../contexts/ThemeContext';
import useAuth from '../../../hooks/useAuth';
import { getApiErrorMessage } from '../../../services/apiError';
import { userService } from '../../../services/userService';

type ProfileForm = { fullName: string; phone: string };

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, logout, updateProfile: updateAuthProfile } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const initialForm = useMemo<ProfileForm>(() => ({
    fullName: user?.fullName ?? '',
    phone: user?.phone ?? '',
  }), [user?.fullName, user?.phone]);
  const [form, setForm] = useState<ProfileForm>(initialForm);
  const [savedForm, setSavedForm] = useState<ProfileForm>(initialForm);
  const [createdAt, setCreatedAt] = useState('');
  const [isPrimaryAdmin, setIsPrimaryAdmin] = useState(Boolean(user?.isPrimaryAdmin));
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const dirty = editing && (form.fullName !== savedForm.fullName || form.phone !== savedForm.phone);
  const initials = useMemo(
    () => (form.fullName || user?.email || 'A').split(/s+/).filter(Boolean).slice(-2).map((word) => word[0]).join('').toUpperCase(),
    [form.fullName, user?.email],
  );

  useEffect(() => {
    let active = true;
    void userService.getProfile().then((profile) => {
      if (!active) return;
      const next = { fullName: profile.fullName, phone: profile.phone || '' };
      setForm(next);
      setSavedForm(next);
      setCreatedAt(profile.createdAt);
      setIsPrimaryAdmin(Boolean(profile.isPrimaryAdmin));
      updateAuthProfile(next);
    }).catch((requestError) => {
      if (active) setError(getApiErrorMessage(requestError, 'Không thể tải hồ sơ.'));
    });
    return () => { active = false; };
  }, [updateAuthProfile]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const save = async () => {
    if (form.fullName.trim().length < 2) {
      setError('Họ và tên phải có ít nhất 2 ký tự.');
      return;
    }
    if (!/^\+?\d{9,15}$/.test(form.phone.replace(/[\s-]/g, ''))) {
      setError('Số điện thoại phải có từ 9 đến 15 chữ số.');
      return;
    }
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const profile = await userService.updateProfile({
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
      });
      const next = { fullName: profile.fullName, phone: profile.phone || '' };
      setForm(next);
      setSavedForm(next);
      updateAuthProfile(next);
      setEditing(false);
      setMessage('Đã cập nhật thông tin.');
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Không thể cập nhật hồ sơ.'));
    } finally {
      setLoading(false);
    }
  };

  const cancel = () => {
    if (dirty && !window.confirm('Thông tin chưa được lưu. Bạn có muốn giữ nguyên dữ liệu cũ không?')) return;
    setForm(savedForm);
    setEditing(false);
    setError('');
  };

  const handleLogout = () => {
    if (dirty && !window.confirm('Thông tin chưa được lưu. Bạn vẫn muốn đăng xuất?')) return;
    logout();
    navigate('/login', { replace: true });
  };

  const joined = createdAt
    ? new Intl.DateTimeFormat('vi-VN', { month: '2-digit', year: 'numeric' }).format(new Date(createdAt))
    : '--/----';
  const roleLabel = user?.role === 'ADMIN'
    ? (isPrimaryAdmin ? 'Admin gốc' : 'Quản trị viên')
    : 'Thành viên';

  return (
    <section className="mx-auto max-w-6xl px-6 py-12">
      <span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[var(--color-primary)]">Admin · Tài khoản</span>
      <h1 className="mt-2 font-display text-4xl">Hồ sơ quản trị viên</h1>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">Quản lý thông tin liên hệ và giao diện hiển thị của tài khoản.</p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[320px_1fr]">
        <aside className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-7 text-center">
          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full border border-[var(--color-primary)] font-display text-3xl text-[var(--color-primary)]">{initials}</div>
          <h2 className="mt-5 font-display text-2xl">{form.fullName || 'Chưa cập nhật tên'}</h2>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Tham gia từ {joined}</p>
          <span className="mt-4 inline-flex rounded-full border border-[var(--color-success-border)] px-3 py-1 text-xs text-[var(--color-success)]">Đang hoạt động</span>
          <p className="mt-4 font-mono-tag text-xs uppercase tracking-[0.16em] text-[var(--color-primary)]">{roleLabel}</p>
          <div className="mt-7 grid grid-cols-2 overflow-hidden rounded-xl border border-[var(--color-border)]">
            <div className="p-4"><p className="font-display text-lg">{roleLabel}</p><p className="mt-1 text-[10px] text-[var(--color-text-dim)]">Vai trò</p></div>
            <div className="border-l border-[var(--color-border)] p-4"><p className="font-display text-lg">Hoạt động</p><p className="mt-1 text-[10px] text-[var(--color-text-dim)]">Trạng thái</p></div>
          </div>
          <Button type="button" variant="secondary" className="mt-6 w-full border-[var(--color-danger-border)] text-[var(--color-danger)]" onClick={handleLogout}>Đăng xuất</Button>
        </aside>

        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-7">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-display text-2xl">Thông tin liên hệ</h2>
            <span className="text-xs text-[var(--color-text-dim)]">Dữ liệu tài khoản</span>
          </div>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <Input label="Họ và tên" name="fullName" disabled={!editing} value={form.fullName} onChange={(event) => setForm((previous) => ({ ...previous, fullName: event.target.value }))} />
            <Input label="Số điện thoại" name="phone" disabled={!editing} value={form.phone} onChange={(event) => setForm((previous) => ({ ...previous, phone: event.target.value }))} />
            <div className="sm:col-span-2"><Input label="Email" name="email" disabled value={user?.email ?? ''} /></div>
          </div>

          <div className="mt-7 border-t border-[var(--color-border)] pt-7">
            <h3 className="font-display text-xl">Giao diện</h3>
            <div className="mt-4 flex items-center justify-between gap-5 rounded-xl border border-[var(--color-border)] p-5">
              <div><p className="font-semibold">{theme === 'dark' ? 'Giao diện tối' : 'Giao diện sáng'}</p><p className="mt-1 text-xs text-[var(--color-text-muted)]">Lựa chọn được lưu trên trình duyệt này.</p></div>
              <Button type="button" variant="secondary" onClick={toggleTheme}>{theme === 'dark' ? 'Dùng giao diện sáng' : 'Dùng giao diện tối'}</Button>
            </div>
          </div>

          {error && <p className="mt-5 rounded-lg border border-[var(--color-danger-border)] p-3 text-sm text-[var(--color-danger)]">{error}</p>}
          {message && <p className="mt-5 rounded-lg border border-[var(--color-success-border)] p-3 text-sm text-[var(--color-success)]">{message}</p>}
          <div className="mt-7 flex flex-wrap justify-end gap-3">
            {!editing ? (
              <Button type="button" onClick={() => { setEditing(true); setMessage(''); }}>Cập nhật thông tin</Button>
            ) : (
              <>
                <Button type="button" variant="secondary" onClick={cancel}>Giữ nguyên</Button>
                <Button type="button" disabled={loading || !dirty} onClick={() => void save()}>{loading ? 'Đang lưu...' : 'Lưu thông tin'}</Button>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
