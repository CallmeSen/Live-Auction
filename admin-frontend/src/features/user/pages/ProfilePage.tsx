import { useNavigate } from 'react-router-dom';
import Button from '../../../components/common/Button';
import useAuth from '../../../hooks/useAuth';
import { useTheme } from '../../../contexts/ThemeContext';

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const handleLogout = () => {
    void logout().finally(() => navigate('/login', { replace: true }));
  };

  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[var(--color-primary)]">Admin · Tài khoản</span>
      <h1 className="mt-2 font-display text-4xl">Hồ sơ quản trị viên</h1>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">Thông tin Cognito hiện có của phiên đăng nhập.</p>

      <div className="mt-8 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-7">
        <dl className="grid gap-5 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wider text-[var(--color-text-dim)]">Email</dt>
            <dd className="mt-2 text-sm">{user?.email ?? '--'}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-[var(--color-text-dim)]">Vai trò</dt>
            <dd className="mt-2 text-sm">ADMIN</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-[var(--color-text-dim)]">User ID</dt>
            <dd className="mt-2 break-all font-mono text-xs">{user?.id ?? '--'}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-[var(--color-text-dim)]">Trạng thái</dt>
            <dd className="mt-2 text-sm text-[var(--color-success)]">Đang hoạt động</dd>
          </div>
        </dl>

        <div className="mt-8 border-t border-[var(--color-border)] pt-6">
          <p className="text-sm font-semibold">Giao diện</p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
            <span className="text-sm text-[var(--color-text-muted)]">Đang dùng giao diện {theme === 'dark' ? 'tối' : 'sáng'}.</span>
            <Button type="button" variant="secondary" onClick={toggleTheme}>
              Đổi giao diện
            </Button>
          </div>
        </div>

        <Button type="button" variant="secondary" className="mt-7 border-[var(--color-danger-border)] text-[var(--color-danger)]" onClick={handleLogout}>
          Đăng xuất
        </Button>
      </div>
    </section>
  );
}
