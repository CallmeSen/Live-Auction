import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Input from '../../../components/common/Input';
import Button from '../../../components/common/Button';
import { registerDemo } from '../../../store/authStore';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ fullName: '', email: '', password: '', confirmPassword: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (form.fullName.trim().length < 2) return setError('Họ tên phải có ít nhất 2 ký tự.');
    if (form.password.length < 6) return setError('Mật khẩu phải có ít nhất 6 ký tự.');
    if (form.password !== form.confirmPassword) return setError('Mật khẩu xác nhận không khớp.');

    setLoading(true);
    window.setTimeout(() => {
      const result = registerDemo({ fullName: form.fullName, email: form.email, password: form.password });
      setLoading(false);
      if (!result.success) return setError(result.message);
      setSuccess(result.message);
      window.setTimeout(() => navigate('/login', { replace: true }), 900);
    }, 450);
  };

  return (
    <div>
      <span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[#C9A227]">Đăng ký</span>
      <h2 className="mt-2 font-display text-3xl text-[#F3EFE6]">Tạo tài khoản bidder</h2>
      <p className="mt-2 text-sm leading-6 text-[#7d9186]">Tài khoản đăng ký trong bản demo mặc định có vai trò người đấu giá.</p>

      <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-4">
        <Input label="Họ và tên" name="fullName" placeholder="Nguyễn Văn A" required value={form.fullName} onChange={(event) => setForm((previous) => ({ ...previous, fullName: event.target.value }))} />
        <Input label="Email" type="email" name="email" placeholder="ban@email.com" required value={form.email} onChange={(event) => setForm((previous) => ({ ...previous, email: event.target.value }))} />
        <Input label="Mật khẩu" type="password" name="password" placeholder="Tối thiểu 6 ký tự" required value={form.password} onChange={(event) => setForm((previous) => ({ ...previous, password: event.target.value }))} />
        <Input label="Xác nhận mật khẩu" type="password" name="confirmPassword" placeholder="Nhập lại mật khẩu" required value={form.confirmPassword} onChange={(event) => setForm((previous) => ({ ...previous, confirmPassword: event.target.value }))} error={error} />
        {success && <p className="rounded-md border border-[#4e8b5e]/40 bg-[#2f6541]/15 px-4 py-3 text-xs text-[#8fc99c]">{success}</p>}
        <Button type="submit" disabled={loading} className="mt-1 w-full">{loading ? 'Đang tạo tài khoản...' : 'Tạo tài khoản'}</Button>
      </form>

      <p className="mt-7 text-center text-sm text-[#7d9186]">Đã có tài khoản?{' '}<Link to="/login" className="font-medium text-[#C9A227]">Đăng nhập</Link></p>
    </div>
  );
}
