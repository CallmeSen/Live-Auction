import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../../components/common/Button';
import Input from '../../../components/common/Input';
import { getApiErrorMessage } from '../../../services/apiError';
import { authService } from '../../../services/authService';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      await authService.forgotPassword({ email: email.trim() });
      setSuccess(
        'Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi.',
      );
    } catch (requestError) {
      setError(
        getApiErrorMessage(
          requestError,
          'Không thể gửi yêu cầu đặt lại mật khẩu. Vui lòng thử lại.',
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[var(--color-primary)]">
        Khôi phục tài khoản
      </span>
      <h2 className="mt-2 font-display text-3xl text-[var(--color-text)]">
        Quên mật khẩu?
      </h2>
      <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
        Nhập email đã đăng ký. Hệ thống sẽ gửi cho bạn đường dẫn đặt lại mật
        khẩu.
      </p>

      <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-4">
        <Input
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="ban@email.com"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={error}
        />

        {success && (
          <div
            role="status"
            className="rounded-md border border-[var(--color-success-border)] bg-[var(--color-surface-alt)] px-4 py-3 text-sm leading-6 text-[var(--color-success)]"
          >
            {success}
          </div>
        )}

        <Button type="submit" disabled={loading} className="mt-1 w-full">
          {loading ? 'Đang gửi...' : 'Gửi hướng dẫn'}
        </Button>
      </form>

      <p className="mt-7 text-center text-sm">
        <Link
          to="/login"
          className="text-[var(--color-text-muted)] transition hover:text-[var(--color-primary)]"
        >
          Quay lại đăng nhập
        </Link>
      </p>
    </div>
  );
}
