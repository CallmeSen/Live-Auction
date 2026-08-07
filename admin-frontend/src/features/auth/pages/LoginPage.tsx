import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../../../components/common/Button';
import Input from '../../../components/common/Input';
import useAuth from '../../../hooks/useAuth';

const NEW_PASSWORD_CHALLENGE_CODE = 'NEW_PASSWORD_REQUIRED';

function isNewPasswordChallenge(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === NEW_PASSWORD_CHALLENGE_CODE;
}

const GENERIC_LOGIN_ERROR = 'Tài khoản hoặc mật khẩu chưa hợp lệ';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, completeNewPassword } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [requiresNewPassword, setRequiresNewPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const userAppUrl = import.meta.env.VITE_USER_APP_URL ?? 'http://localhost:5173';

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (requiresNewPassword) {
        if (newPassword !== confirmNewPassword) {
          setError('New passwords do not match.');
          return;
        }
        await completeNewPassword(newPassword);
      } else {
        await login(form.email.trim(), form.password);
      }
      navigate('/admin', { replace: true });
    } catch (caught: unknown) {
      if (!requiresNewPassword && isNewPasswordChallenge(caught)) {
        setForm((current) => ({ ...current, password: '' }));
        setRequiresNewPassword(true);
        setError('Set a new password to finish your first admin sign-in.');
      } else if (requiresNewPassword) {
        setError('Unable to set the new password.');
      } else {
        setForm((current) => ({ ...current, password: '' }));
        setError(GENERIC_LOGIN_ERROR);
      }
    } finally {
      setLoading(false);
    }
  };

  return <div>
    <span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[var(--color-primary)]">Quản trị hệ thống</span>
    <h1 className="mt-2 font-display text-3xl">Đăng nhập Admin</h1>
    <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">Trang này chỉ dành cho tài khoản quản trị đã được cấp.</p>
    <form onSubmit={submit} className="mt-7 flex flex-col gap-4">
      <Input label="Email" type="email" name="email" autoComplete="username" required value={form.email} onChange={(event) => setForm((value) => ({ ...value, email: event.target.value }))} />
      {requiresNewPassword ? <>
        <Input label="New password" type={showPassword ? 'text' : 'password'} name="new-password" autoComplete="new-password" required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} error={error} />
        <Input label="Confirm new password" type={showPassword ? 'text' : 'password'} name="confirm-new-password" autoComplete="new-password" required value={confirmNewPassword} onChange={(event) => setConfirmNewPassword(event.target.value)} />
      </> : <Input label="Mật khẩu" type={showPassword ? 'text' : 'password'} name="password" autoComplete="current-password" required value={form.password} onChange={(event) => setForm((value) => ({ ...value, password: event.target.value }))} error={error} />}
      <label className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]"><input type="checkbox" checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)} /> Hiện mật khẩu</label>
      <Button type="submit" disabled={loading} className="w-full">{loading ? 'Đang xử lý...' : requiresNewPassword ? 'Set new password' : 'Đăng nhập quản trị'}</Button>
    </form>
    <p className="mt-6 text-center text-xs text-[var(--color-text-dim)]">Không có đăng ký hoặc quên mật khẩu Admin công khai.</p>
    <p className="mt-3 text-center text-sm"><a href={userAppUrl} className="text-[var(--color-primary)]">Mở website thành viên</a></p>
  </div>;
}
