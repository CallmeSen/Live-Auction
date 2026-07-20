import axios from 'axios';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { authApi } from '../../../api/authApi';
import Input from '../../../components/common/Input';
import Button from '../../../components/common/Button';
import { demoAccounts, getRoleHome, persistAuthSession } from '../../../store/authStore';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const chooseAccount = (email: string, password: string) => {
    setForm({ email, password });
    setError('');
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await authApi.login({
        email: form.email.trim(),
        password: form.password,
      });

      const user = persistAuthSession(
        response.data.data.accessToken,
        response.data.data.user,
      );

      navigate(from || getRoleHome(user.role), { replace: true });
    } catch (loginError) {
      if (axios.isAxiosError(loginError)) {
        if (!loginError.response) {
          setError('Không thể kết nối tới máy chủ. Hãy kiểm tra backend đang chạy trên cổng 8000.');
          return;
        }

        const apiMessage = (loginError.response?.data as { message?: string } | undefined)?.message;
        setError(apiMessage ?? 'Email hoặc mật khẩu không đúng.');
        return;
      }

      setError('Không thể đăng nhập. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[var(--color-primary)]">Đăng nhập</span>
      <h2 className="mt-2 font-display text-3xl text-[var(--color-text)]">Chào mừng trở lại</h2>
      <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">Chọn nhanh một tài khoản demo hoặc nhập tài khoản của bạn.</p>

      <div className="mt-5 grid gap-2.5">
        {demoAccounts.map((account) => (
          <button
            type="button"
            key={account.email}
            onClick={() => chooseAccount(account.email, account.password)}
            className={`rounded-lg border p-3 text-left transition ${form.email === account.email
              ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10'
              : 'border-[var(--color-border)] bg-[var(--color-surface-alt)] hover:border-[var(--color-border-strong)]'
              }`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-[var(--color-text)]">{account.label}</span>
              <span className="font-mono-tag text-[10px] text-[var(--color-primary)]">{account.email}</span>
            </div>
            <p className="mt-1 text-[11px] text-[var(--color-text-dim)]">{account.description}</p>
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
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
          type="password"
          name="password"
          placeholder="••••••"
          required
          value={form.password}
          onChange={(event) => setForm((previous) => ({ ...previous, password: event.target.value }))}
          error={error}
        />

        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2 text-[var(--color-text-muted)]"><input type="checkbox" className="accent-[var(--color-primary)]" /> Ghi nhớ đăng nhập</label>
          <button type="button" className="text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]">Quên mật khẩu?</button>
        </div>

        <Button type="submit" disabled={loading} className="mt-1 w-full">{loading ? 'Đang đăng nhập...' : 'Đăng nhập'}</Button>
      </form>

      <p className="mt-7 text-center text-sm text-[var(--color-text-muted)]">
        Chưa có tài khoản?{' '}
        <Link to="/register" state={{ from }} className="font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]" >Đăng ký ngay</Link>
      </p>
    </div>
  );
}
