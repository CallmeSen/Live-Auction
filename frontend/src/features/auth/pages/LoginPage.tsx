import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Input from '../../../components/common/Input';
import Button from '../../../components/common/Button';
import { getRoleHome, persistAuthSession } from '../../../store/authStore';
import { authService } from '../../../services/authService';
import { getApiErrorMessage } from '../../../services/apiError';

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
      const loginData = await authService.login({
        email: form.email.trim(),
        password: form.password,
      });
      const user = persistAuthSession(
        loginData.accessToken,
        loginData.user,
      );
      navigate(from || getRoleHome(user.role), { replace: true });
    } catch (loginError) {
      setError(
        getApiErrorMessage(
          loginError,
          'Email hoặc mật khẩu không đúng.',
        ),
      );
    } finally {
      setLoading(false);
    }
  };
  return (
    <div>
      <span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[var(--color-primary)]">Đăng nhập</span>
      <h2 className="mt-2 font-display text-3xl text-[var(--color-text)]">Chào mừng trở lại</h2>
      <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">Nhập tài khoản của bạn để tiếp tục tham gia các phiên đấu giá.</p>

      <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-4">
        <Input
          label="Email"
          type="email"
          name="email"
          placeholder="ban@email.com"
          required
          value={form.email}
          onChange={(event) => setForm((previous) => ({ ...previous, email: event.target.value }))}
        />
        <Input
          label="Mật khẩu"
          type={showPassword ? 'text' : 'password'}
          name="password"
          autoComplete="current-password"
          placeholder="••••••"
          required
          value={form.password}
          onChange={(event) => setForm((previous) => ({ ...previous, password: event.target.value }))}
          error={error}
        />

        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2 text-[var(--color-text-muted)]">
            <input
              type="checkbox"
              checked={showPassword}
              onChange={(event) => setShowPassword(event.target.checked)}
              className="accent-[var(--color-primary)]"
            />
            {'Hi\u1EC7n m\u1EADt kh\u1EA9u'}
          </label>
          <Link to="/forgot-password" className="text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]">Quên mật khẩu?</Link>
        </div>

        <Button type="submit" disabled={loading} className="mt-1 w-full">{loading ? 'Đang đăng nhập...' : 'Đăng nhập'}</Button>
      </form>

      <p className="mt-7 text-center text-sm text-[var(--color-text-muted)]">
        Chưa có tài khoản?{' '}
        <Link to="/register" state={{ from }} className="font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]" >Đăng ký ngay</Link>
      </p>
      <p className="mt-3 text-center text-sm">
        <Link to="/auctions" className="text-[var(--color-text-muted)] transition hover:text-[var(--color-primary)]">Tiếp tục khám phá mà không cần đăng nhập</Link>
      </p>
    </div>
  );
}
