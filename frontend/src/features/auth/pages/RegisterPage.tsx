import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Input from '../../../components/common/Input';
import Button from '../../../components/common/Button';
import type { RegisterForm } from '../types';
import { authService } from '../../../services/authService';
import { getApiErrorMessage } from '../../../services/apiError';

export default function RegisterPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const [form, setForm] = useState<RegisterForm>({
    fullName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (form.fullName.trim().length < 2) return setError('Họ tên phải có ít nhất 2 ký tự.');
    if (form.password.length < 6) return setError('Mật khẩu phải có ít nhất 6 ký tự.');
    if (form.password !== form.confirmPassword) return setError('Mật khẩu xác nhận không khớp.');
    const normalizedPhone = form.phone.replace(/[\s-]/g, '');
    if (!/^\+?\d{9,15}$/.test(normalizedPhone)) {
      return setError('Số điện thoại phải có từ 9 đến 15 chữ số.');
    }

    setLoading(true);

    try {
      await authService.register({
        fullName: form.fullName.trim(),
        email: form.email.trim().toLowerCase(),
        phone: normalizedPhone,
        password: form.password,
      });

      setSuccess('Đăng ký thành công.');

      window.setTimeout(
        () => navigate('/login', {
          replace: true,
          state: { from },
        }),
        900,
      );
    } catch (registerError) {
      setError(
        getApiErrorMessage(
          registerError,
          'Thông tin đăng ký chưa hợp lệ.',
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[var(--color-primary)]">Đăng ký</span>
      <h2 className="mt-2 font-display text-3xl text-[var(--color-text)]">Tạo tài khoản thành viên</h2>
      <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">Một tài khoản có thể tham gia trả giá và gửi vật phẩm để Admin duyệt.</p>

      <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-4">
        <Input label="Họ và tên" name="fullName" placeholder="Nguyễn Văn A" required value={form.fullName} onChange={(event) => setForm((previous) => ({ ...previous, fullName: event.target.value }))} />
        <Input label="Email" type="email" name="email" placeholder="ban@email.com" required value={form.email} onChange={(event) => setForm((previous) => ({ ...previous, email: event.target.value }))} />
        <Input label="Số điện thoại" type="tel" name="phone" placeholder="0901234567" required value={form.phone} onChange={(event) => setForm((previous) => ({ ...previous, phone: event.target.value }))} />
        <Input label="Mật khẩu" type="password" name="password" placeholder="Tối thiểu 6 ký tự" required value={form.password} onChange={(event) => setForm((previous) => ({ ...previous, password: event.target.value }))} />
        <Input label="Xác nhận mật khẩu" type="password" name="confirmPassword" placeholder="Nhập lại mật khẩu" required value={form.confirmPassword} onChange={(event) => setForm((previous) => ({ ...previous, confirmPassword: event.target.value }))} error={error} />
        {success && <p className="rounded-md border border-[var(--color-success-border)]/40 bg-[var(--color-success-bg)]/15 px-4 py-3 text-xs text-[var(--color-success)]">{success}</p>}
        <Button type="submit" disabled={loading} className="mt-1 w-full">{loading ? 'Đang tạo tài khoản...' : 'Tạo tài khoản'}</Button>
      </form>

      <p className="mt-7 text-center text-sm text-[var(--color-text-muted)]">Đã có tài khoản?{' '}<Link to="/login" state={{ from }} className="font-medium text-[var(--color-primary)]">Đăng nhập</Link></p>
      <p className="mt-3 text-center text-sm">
        <Link to="/auctions" className="text-[var(--color-text-muted)] transition hover:text-[var(--color-primary)]">Tiếp tục khám phá mà không cần đăng nhập</Link>
      </p>
    </div>
  );
}
