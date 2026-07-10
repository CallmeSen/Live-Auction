import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Input from '../../../components/common/Input';
import Button from '../../../components/common/Button';

// Tài khoản demo - dùng tạm khi chưa nối backend thật
const DEMO_EMAIL = 'demo@auction.com';
const DEMO_PASSWORD = '123456';

export default function LoginPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // TODO: thay đoạn này bằng authApi.login(form) khi nối backend thật
    setTimeout(() => {
      if (form.email === DEMO_EMAIL && form.password === DEMO_PASSWORD) {
        localStorage.setItem('accessToken', 'demo-token');
        navigate('/home');
      } else {
        setError('Email hoặc mật khẩu không đúng');
      }
      setLoading(false);
    }, 500);
  };

  return (
    <div>
      <span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[#C9A227]">
        Đăng nhập
      </span>
      <h2 className="font-display text-3xl mt-2 text-[#F3EFE6]">Chào mừng trở lại</h2>
      <p className="mt-2 text-sm text-[#7d9186]">
        Đăng nhập để tiếp tục theo dõi các phiên đấu giá của bạn.
      </p>

      <div className="mt-5 rounded-md border border-[#2a3f31] bg-[#16241c] px-4 py-3">
        <p className="text-xs text-[#7d9186]">
          Tài khoản demo (chưa nối backend):
        </p>
        <p className="font-mono-tag text-xs text-[#C9A227] mt-1">
          {DEMO_EMAIL} / {DEMO_PASSWORD}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-5">
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
          error={error}
        />

        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2 text-[#7d9186]">
            <input type="checkbox" className="accent-[#C9A227]" />
            Ghi nhớ đăng nhập
          </label>
          <a href="#" className="text-[#C9A227] hover:text-[#e0c15a]">
            Quên mật khẩu?
          </a>
        </div>

        <Button type="submit" disabled={loading} className="w-full mt-2">
          {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </Button>
      </form>

      <p className="mt-8 text-sm text-center text-[#7d9186]">
        Chưa có tài khoản?{' '}
        <Link to="/register" className="text-[#C9A227] hover:text-[#e0c15a] font-medium">
          Đăng ký ngay
        </Link>
      </p>
    </div>
  );
}