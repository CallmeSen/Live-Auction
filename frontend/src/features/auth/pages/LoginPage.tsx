import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Input from '../../../components/common/Input';
import Button from '../../../components/common/Button';
import { demoAccounts, getRoleHome, loginDemo } from '../../../store/authStore';

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

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    window.setTimeout(() => {
      const user = loginDemo(form.email, form.password);
      setLoading(false);
      if (!user) {
        setError('Email hoặc mật khẩu không đúng. Vui lòng chọn một tài khoản demo bên dưới.');
        return;
      }
      navigate(from || getRoleHome(user.role), { replace: true });
    }, 350);
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
