import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Button from '../../../components/common/Button';
import Input from '../../../components/common/Input';
import { getApiErrorMessage } from '../../../services/apiError';
import { authService } from '../../../services/authService';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token')?.trim() ?? '';
  const [form, setForm] = useState({
    newPassword: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (!token) {
      setError(
        'Đường dẫn đặt lại mật khẩu không hợp lệ hoặc thiếu token.',
      );
      return;
    }

    if (form.newPassword.length < 6 || form.newPassword.length > 72) {
      setError('Mật khẩu mới phải có từ 6 đến 72 ký tự.');
      return;
    }

    if (form.newPassword !== form.confirmPassword) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }

    setLoading(true);

    try {
      await authService.resetPassword({
        token,
        newPassword: form.newPassword,
      });
      setSuccess(true);
      setForm({ newPassword: '', confirmPassword: '' });
    } catch (requestError) {
      setError(
        getApiErrorMessage(
          requestError,
          'Không thể đặt lại mật khẩu. Liên kết có thể đã hết hạn hoặc đã được sử dụng.',
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div>
        <span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[var(--color-primary)]">
          Hoàn tất
        </span>
        <h2 className="mt-2 font-display text-3xl text-[var(--color-text)]">
          Đổi mật khẩu thành công
        </h2>
        <p className="mt-3 text-sm leading-6 text-[var(--color-text-muted)]">
          Bạn có thể đăng nhập bằng mật khẩu mới.
        </p>
        <Link
          to="/login"
          className="mt-7 inline-flex w-full items-center justify-center rounded-md bg-[var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-[var(--color-bg)] transition hover:bg-[var(--color-primary-hover)]"
        >
          Đi đến đăng nhập
        </Link>
      </div>
    );
  }

  return (
    <div>
      <span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[var(--color-primary)]">
        Bảo mật tài khoản
      </span>
      <h2 className="mt-2 font-display text-3xl text-[var(--color-text)]">
        Đặt lại mật khẩu
      </h2>
      <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
        Tạo mật khẩu mới có từ 6 đến 72 ký tự.
      </p>

      <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-4">
        <Input
          label="Mật khẩu mới"
          type="password"
          name="newPassword"
          autoComplete="new-password"
          minLength={6}
          maxLength={72}
          required
          value={form.newPassword}
          onChange={(event) =>
            setForm((previous) => ({
              ...previous,
              newPassword: event.target.value,
            }))
          }
        />
        <Input
          label="Xác nhận mật khẩu"
          type="password"
          name="confirmPassword"
          autoComplete="new-password"
          minLength={6}
          maxLength={72}
          required
          value={form.confirmPassword}
          onChange={(event) =>
            setForm((previous) => ({
              ...previous,
              confirmPassword: event.target.value,
            }))
          }
          error={error}
        />

        <Button
          type="submit"
          disabled={loading || !token}
          className="mt-1 w-full"
        >
          {loading ? 'Đang cập nhật...' : 'Đặt lại mật khẩu'}
        </Button>
      </form>

      {!token && (
        <p className="mt-4 text-sm text-[var(--color-danger-solid)]">
          Đường dẫn không hợp lệ. Hãy yêu cầu một email đặt lại mật khẩu mới.
        </p>
      )}

      <p className="mt-7 text-center text-sm">
        <Link
          to="/forgot-password"
          className="text-[var(--color-text-muted)] transition hover:text-[var(--color-primary)]"
        >
          Gửi lại email đặt lại mật khẩu
        </Link>
      </p>
    </div>
  );
}
