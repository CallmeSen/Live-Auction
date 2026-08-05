import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Input from '../../../components/common/Input';
import Button from '../../../components/common/Button';
import { persistAuthSession } from '../../../store/authStore';
import { authService } from '../../../services/authService';
import { getApiErrorMessage } from '../../../services/apiError';

const adminAppUrl = import.meta.env.VITE_ADMIN_APP_URL ?? 'http://localhost:5174';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const loginData = await authService.login({ email: form.email.trim(), password: form.password });
      if (loginData.user.role === 'ADMIN') {
        setError('Tài khoản quản trị phải đăng nhập tại trang quản trị.');
        return;
      }
      persistAuthSession(loginData.accessToken, loginData.user);
      navigate(from || '/auctions', { replace: true });
    } catch (loginError) {
      setError(getApiErrorMessage(loginError, 'Email hoặc mật khẩu không đúng.'));
    } finally { setLoading(false); }
  };

  return (
    <div>
      <span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[var(--color-primary)]">Đăng nhập</span>
      <h2 className="mt-2 font-display text-3xl text-[var(--color-text)]">Chào mừng trở lại</h2>
      <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">Đăng nhập bằng tài khoản thành viên để tham gia đấu giá.</p>
      <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-4">
        <Input label="Email" type="email" name="email" autoComplete="email" required value={form.email} onChange={(event) => setForm((previous) => ({ ...previous, email: event.target.value }))} />
        <Input label="Mật khẩu" type={showPassword ? 'text' : 'password'} name="password" autoComplete="current-password" required value={form.password} onChange={(event) => setForm((previous) => ({ ...previous, password: event.target.value }))} error={error} />
        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2 text-[var(--color-text-muted)]"><input type="checkbox" checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)} />Hiện mật khẩu</label>
          <Link to="/forgot-password" className="text-[var(--color-primary)]">Quên mật khẩu?</Link>
        </div>
        <Button type="submit" disabled={loading} className="w-full">{loading ? 'Đang đăng nhập...' : 'Đăng nhập'}</Button>
      </form>
      <p className="mt-7 text-center text-sm text-[var(--color-text-muted)]">Chưa có tài khoản? <Link to="/register" state={{ from }} className="text-[var(--color-primary)]">Đăng ký ngay</Link></p>
      <p className="mt-3 text-center text-sm"><Link to="/auctions" className="text-[var(--color-text-muted)]">Tiếp tục khám phá không cần đăng nhập</Link></p>
      <p className="mt-5 border-t border-[var(--color-border)] pt-5 text-center text-xs text-[var(--color-text-dim)]">Bạn là quản trị viên? <a href={adminAppUrl} className="text-[var(--color-primary)]">Mở trang quản trị</a></p>
    </div>
  );
}
