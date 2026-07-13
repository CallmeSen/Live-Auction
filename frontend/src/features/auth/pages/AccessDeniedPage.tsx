import { Link } from 'react-router-dom';
import { getCurrentUser, getRoleHome } from '../../../store/authStore';

export default function AccessDeniedPage() {
  const user = getCurrentUser();
  return (
    <div className="mx-auto flex min-h-[65vh] max-w-2xl flex-col items-center justify-center px-6 text-center">
      <span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[var(--color-danger-solid)]">403 · Không có quyền</span>
      <h1 className="mt-4 font-display text-4xl">Tài khoản này không thể truy cập trang vừa chọn.</h1>
      <p className="mt-4 max-w-lg text-sm leading-6 text-[var(--color-text-muted)]">
        Giao diện demo đang mô phỏng quyền theo vai trò. Hãy quay về khu vực phù hợp hoặc đăng nhập bằng một tài khoản demo khác.
      </p>
      <div className="mt-7 flex gap-3">
        <Link to={getRoleHome(user?.role)} className="rounded-md bg-[var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-[var(--color-bg)]">Về trang chính</Link>
        <Link to="/login" className="rounded-md border border-[var(--color-border-strong)] px-5 py-2.5 text-sm text-[var(--color-text)]">Đổi tài khoản</Link>
      </div>
    </div>
  );
}
