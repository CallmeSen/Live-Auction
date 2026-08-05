import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../../../components/common/Button';
import Input from '../../../components/common/Input';
import { getApiErrorMessage } from '../../../services/apiError';
import { authService } from '../../../services/authService';
import { persistAuthSession } from '../../../store/authStore';

export default function LoginPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const userAppUrl = import.meta.env.VITE_USER_APP_URL ?? 'http://localhost:5173';
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setLoading(true); setError('');
    try {
      const data = await authService.login({ email: form.email.trim(), password: form.password });
      if (data.user.role !== 'ADMIN') {
        setError('Tài khoản này không có quyền truy cập trang quản trị.');
        return;
      }
      persistAuthSession(data.accessToken, data.user);
      navigate('/admin', { replace: true });
    } catch (requestError) { setError(getApiErrorMessage(requestError, 'Email hoặc mật khẩu không đúng.')); }
    finally { setLoading(false); }
  };
  return <div>
    <span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[var(--color-primary)]">Quản trị hệ thống</span>
    <h1 className="mt-2 font-display text-3xl">Đăng nhập Admin</h1>
    <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">Trang này chỉ dành cho tài khoản quản trị đã được Admin gốc cấp.</p>
    <form onSubmit={submit} className="mt-7 flex flex-col gap-4">
      <Input label="Email" type="email" name="email" autoComplete="username" required value={form.email} onChange={(event) => setForm((value) => ({ ...value, email: event.target.value }))} />
      <Input label="Mật khẩu" type={showPassword ? 'text' : 'password'} name="password" autoComplete="current-password" required value={form.password} onChange={(event) => setForm((value) => ({ ...value, password: event.target.value }))} error={error} />
      <label className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]"><input type="checkbox" checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)} /> Hiện mật khẩu</label>
      <Button type="submit" disabled={loading} className="w-full">{loading ? 'Đang đăng nhập...' : 'Đăng nhập quản trị'}</Button>
    </form>
    <p className="mt-6 text-center text-xs text-[var(--color-text-dim)]">Không có đăng ký hoặc quên mật khẩu Admin công khai.</p>
    <p className="mt-3 text-center text-sm"><a href={userAppUrl} className="text-[var(--color-primary)]">Mở website thành viên</a></p>
  </div>;
}
