import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Button from '../../../components/common/Button';
import Input from '../../../components/common/Input';
import { cognitoAccountService } from '../../../auth/cognito';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const email = searchParams.get('email')?.trim().toLowerCase() ?? '';
  const [form, setForm] = useState({
    confirmationCode: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (!email || !/^\d{6}$/.test(form.confirmationCode.trim())) {
      setError('Email or reset code is invalid.');
      return;
    }
    if (form.newPassword.length < 12 || form.newPassword.length > 72) {
      setError('Password must contain 12 to 72 characters.');
      return;
    }
    if (form.newPassword !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await cognitoAccountService.confirmResetPassword(
        email,
        form.confirmationCode,
        form.newPassword,
      );
      setSuccess(true);
      setForm({ confirmationCode: '', newPassword: '', confirmPassword: '' });
    } catch {
      setError('Unable to reset the password. The code may have expired.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div>
        <h2 className="mt-2 font-display text-3xl text-[var(--color-text)]">Password reset complete</h2>
        <p className="mt-3 text-sm leading-6 text-[var(--color-text-muted)]">
          You can now sign in with the new password.
        </p>
        <Link
          to="/login"
          className="mt-7 inline-flex w-full items-center justify-center rounded-md bg-[var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-[var(--color-bg)]"
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h2 className="mt-2 font-display text-3xl text-[var(--color-text)]">Reset password</h2>
      <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
        Enter the code sent to {email || 'your email'} and choose a new password.
      </p>
      <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-4">
        <Input
          label="Reset code"
          name="confirmationCode"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          value={form.confirmationCode}
          onChange={(event) => setForm((previous) => ({ ...previous, confirmationCode: event.target.value }))}
        />
        <Input
          label="New password"
          type="password"
          name="newPassword"
          autoComplete="new-password"
          minLength={12}
          maxLength={72}
          required
          value={form.newPassword}
          onChange={(event) => setForm((previous) => ({ ...previous, newPassword: event.target.value }))}
        />
        <Input
          label="Confirm password"
          type="password"
          name="confirmPassword"
          autoComplete="new-password"
          minLength={12}
          maxLength={72}
          required
          value={form.confirmPassword}
          onChange={(event) => setForm((previous) => ({ ...previous, confirmPassword: event.target.value }))}
          error={error}
        />
        <Button type="submit" disabled={loading || !email} className="w-full">
          {loading ? 'Resetting...' : 'Reset password'}
        </Button>
      </form>
      <p className="mt-7 text-center text-sm">
        <Link to="/forgot-password" className="text-[var(--color-text-muted)] transition hover:text-[var(--color-primary)]">
          Request another code
        </Link>
      </p>
    </div>
  );
}
