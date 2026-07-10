import { useState } from 'react';
import { Link } from 'react-router-dom';
import Input from '../../../components/common/Input';
import Button from '../../../components/common/Button';

export default function RegisterPage() {
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      setError('Mật khẩu xác nhận không khớp');
      return;
    }
    setError('');
    setLoading(true);
    // TODO: gọi authApi.register(form) khi kết nối backend
    setTimeout(() => setLoading(false), 800);
  };

  return (
    <div>
      <span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[#C9A227]">
        Đăng ký
      </span>
      <h2 className="font-display text-3xl mt-2 text-[#F3EFE6]">Tạo tài khoản mới</h2>
      <p className="mt-2 text-sm text-[#7d9186]">
        Tham gia Auction App để bắt đầu đấu giá ngay hôm nay.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
        <Input
          label="Họ và tên"
          name="fullName"
          placeholder="Nguyễn Văn A"
          required
          value={form.fullName}
          onChange={handleChange}
        />
        <Input
          label="Email"
          type="email"
          name="email"
          placeholder="ban@email.com"
          required
          value={form.email}
          onChange={handleChange}
        />
        <Input
          label="Mật khẩu"
          type="password"
          name="password"
          placeholder="••••••••"
          required
          value={form.password}
          onChange={handleChange}
        />
        <Input
          label="Xác nhận mật khẩu"
          type="password"
          name="confirmPassword"
          placeholder="••••••••"
          required
          value={form.confirmPassword}
          onChange={handleChange}
          error={error}
        />

        <Button type="submit" disabled={loading} className="w-full mt-2">
          {loading ? 'Đang tạo tài khoản...' : 'Tạo tài khoản'}
        </Button>
      </form>

      <p className="mt-8 text-sm text-center text-[#7d9186]">
        Đã có tài khoản?{' '}
        <Link to="/login" className="text-[#C9A227] hover:text-[#e0c15a] font-medium">
          Đăng nhập
        </Link>
      </p>
    </div>
  );
}