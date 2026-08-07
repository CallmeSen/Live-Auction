import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { AuthRole } from '../../../auth/types';
import Input from '../../../components/common/Input';
import Button from '../../../components/common/Button';
import useAuth from '../../../hooks/useAuth';

const USER_HOME = '/auctions';
const INVALID_CREDENTIALS_MESSAGE = 'Tài khoản hoặc mật khẩu chưa hợp lệ';

const COMMON_PROTECTED_PATHS = new Set(['/profile']);

function isRoleRoute(role: AuthRole, pathname: string): boolean {
  if (role === 'USER') {
    return pathname === '/my-auctions'
      || pathname === '/my-bids'
      || pathname === '/auctions/create'
      || /^\/auction-sessions\/[^/]+\/items\/create$/.test(pathname)
      || /^\/auction-items\/[^/]+\/edit$/.test(pathname)
      || /^\/auction-items\/[^/]+$/.test(pathname);
  }

  return false;
}

function getPostLoginPath(role: AuthRole, from?: string): string {
  if (!from || !from.startsWith('/') || from.startsWith('//')) {
    return USER_HOME;
  }

  const url = new URL(from, window.location.origin);

  if (
    COMMON_PROTECTED_PATHS.has(url.pathname)
    || isRoleRoute(role, url.pathname)
  ) {
    return `${url.pathname}${url.search}${url.hash}`;
  }

  return USER_HOME;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, session, status } = useAuth();

  const from = (location.state as { from?: string } | null)?.from;

  const [form, setForm] = useState({
    email: '',
    password: '',
  });

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (status !== 'authenticated' || !session) {
      return;
    }

    navigate(getPostLoginPath(session.role, from), {
      replace: true,
    });
  }, [from, navigate, session, status]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const email = form.email.trim();
    const password = form.password;

    setForm((current) => ({
      ...current,
      password: '',
    }));

    setError('');
    setLoading(true);

    try {
      await login(email, password);
    } catch {
      setError(INVALID_CREDENTIALS_MESSAGE);
      setLoading(false);
    }
  };

  return (
    <div>
      <span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[var(--color-primary)]">
        Đăng nhập
      </span>

      <h2 className="mt-2 font-display text-3xl text-[var(--color-text)]">
        Chào mừng trở lại
      </h2>

      <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
        Đăng nhập bằng tài khoản thành viên để tham gia đấu giá.
      </p>

      <form
        onSubmit={handleSubmit}
        className="mt-7 flex flex-col gap-4"
      >
        <Input
          label="Email"
          type="email"
          name="email"
          autoComplete="username"
          placeholder="ban@email.com"
          required
          disabled={loading}
          value={form.email}
          onChange={(event) => {
            setForm((previous) => ({
              ...previous,
              email: event.target.value,
            }));
          }}
        />

        <Input
          label="Mật khẩu"
          type={showPassword ? 'text' : 'password'}
          name="password"
          autoComplete="current-password"
          placeholder="••••••"
          required
          disabled={loading}
          value={form.password}
          onChange={(event) => {
            setForm((previous) => ({
              ...previous,
              password: event.target.value,
            }));
          }}
        />

        <div className="flex items-center justify-between gap-4 text-sm">
          <label className="flex items-center gap-2 text-[var(--color-text-muted)]">
            <input
              type="checkbox"
              checked={showPassword}
              disabled={loading}
              onChange={(event) => setShowPassword(event.target.checked)}
              className="accent-[var(--color-primary)]"
            />

            Hiện mật khẩu
          </label>

          <Link
            to="/forgot-password"
            className="text-[var(--color-primary)] transition hover:underline"
          >
            Quên mật khẩu?
          </Link>
        </div>

        {error && (
          <p
            role="alert"
            className="text-xs text-[var(--color-danger-solid)]"
          >
            {error}
          </p>
        )}

        <Button
          type="submit"
          disabled={loading}
          className="mt-1 w-full"
        >
          {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </Button>
      </form>

      <p className="mt-7 text-center text-sm text-[var(--color-text-muted)]">
        Chưa có tài khoản?{' '}
        <Link
          to="/register"
          state={{ from }}
          className="font-medium text-[var(--color-primary)]"
        >
          Đăng ký ngay
        </Link>
      </p>

      <p className="mt-3 text-center text-sm">
        <Link
          to="/auctions"
          className="text-[var(--color-text-muted)] transition hover:text-[var(--color-primary)]"
        >
          Tiếp tục khám phá không cần đăng nhập
        </Link>
      </p>

    </div>
  );
}
