import { Link } from 'react-router-dom';
export default function AccessDeniedPage() {
  return <section className="mx-auto flex min-h-[65vh] max-w-2xl flex-col items-center justify-center px-6 text-center"><span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[var(--color-danger)]">403 · Không có quyền</span><h1 className="mt-4 font-display text-4xl">Tài khoản Admin này không có quyền thực hiện tác vụ.</h1><p className="mt-4 text-sm leading-6 text-[var(--color-text-muted)]">Các chức năng quản lý tài khoản Admin chỉ dành cho Admin gốc.</p><Link to="/admin" className="mt-7 rounded-md bg-[var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-[var(--color-bg)]">Về tổng quan</Link></section>;
}
