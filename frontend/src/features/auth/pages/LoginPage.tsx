import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Input from '../../../components/common/Input';
import Button from '../../../components/common/Button';
import { demoAccounts, getRoleHome, loginDemo } from '../../../store/authStore';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
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
      const requestedPath = (location.state as { from?: string } | null)?.from;
      navigate(requestedPath || getRoleHome(user.role), { replace: true });
    }, 350);
  };

  return (
    <div>
      <span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[#C9A227]">Đăng nhập</span>
      <h2 className="mt-2 font-display text-3xl text-[#F3EFE6]">Chào mừng trở lại</h2>
      <p className="mt-2 text-sm leading-6 text-[#7d9186]">Chọn nhanh một vai trò demo hoặc nhập tài khoản của bạn.</p>

      <div className="mt-5 grid gap-2.5">
        {demoAccounts.map((account) => (
          <button
            type="button"
            key={account.email}
            onClick={() => chooseAccount(account.email, account.password)}
            className={`rounded-lg border p-3 text-left transition ${
              form.email === account.email
                ? 'border-[#C9A227] bg-[#C9A227]/10'
                : 'border-[#2a3f31] bg-[#16241c] hover:border-[#566b5c]'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-[#F3EFE6]">{account.label}</span>
              <span className="font-mono-tag text-[10px] text-[#C9A227]">{account.email}</span>
            </div>
            <p className="mt-1 text-[11px] text-[#607468]">{account.description}</p>
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
          <label className="flex items-center gap-2 text-[#7d9186]"><input type="checkbox" className="accent-[#C9A227]" /> Ghi nhớ đăng nhập</label>
          <button type="button" className="text-[#C9A227] hover:text-[#e0c15a]">Quên mật khẩu?</button>
        </div>

        <Button type="submit" disabled={loading} className="mt-1 w-full">{loading ? 'Đang đăng nhập...' : 'Đăng nhập'}</Button>
      </form>

      <p className="mt-7 text-center text-sm text-[#7d9186]">
        Chưa có tài khoản?{' '}
        <Link to="/register" className="font-medium text-[#C9A227] hover:text-[#e0c15a]">Đăng ký ngay</Link>
      </p>
    </div>
  );
}
