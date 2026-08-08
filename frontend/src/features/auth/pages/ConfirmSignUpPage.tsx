import { useState, type FormEvent } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import Button from '../../../components/common/Button';
import Input from '../../../components/common/Input';
import { cognitoAccountService } from '../../../auth/cognito';

export default function ConfirmSignUpPage() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const email = searchParams.get('email')?.trim().toLowerCase() ?? '';
  const from = (location.state as { from?: string } | null)?.from;
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (!email || !/^\d{6}$/.test(code.trim())) {
      setError('Email or confirmation code is invalid.');
      return;
    }

    setLoading(true);
    try {
      await cognitoAccountService.confirmSignUp(email, code);
      setConfirmed(true);
    } catch {
      setError('Unable to confirm the account. The code may have expired.');
    } finally {
      setLoading(false);
    }
  };

  if (confirmed) {
    return (
      <div>
        <h2 className="font-display text-3xl text-[var(--color-text)]">Account confirmed</h2>
        <p className="mt-3 text-sm leading-6 text-[var(--color-text-muted)]">
          You can now sign in with your new account.
        </p>
        <Link
          to="/login"
          state={{ from }}
          className="mt-7 inline-flex w-full items-center justify-center rounded-md bg-[var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-[var(--color-bg)]"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h2 className="font-display text-3xl text-[var(--color-text)]">Confirm your account</h2>
      <p className="mt-3 text-sm leading-6 text-[var(--color-text-muted)]">
        Enter the six-digit code sent to {email || 'your email'}.
      </p>
      <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-4">
        <Input
          label="Confirmation code"
          name="confirmationCode"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          value={code}
          onChange={(event) => setCode(event.target.value)}
          error={error}
        />
        <Button type="submit" disabled={loading || !email} className="w-full">
          {loading ? 'Confirming...' : 'Confirm account'}
        </Button>
      </form>
      <p className="mt-7 text-center text-sm">
        <Link to="/register" className="text-[var(--color-text-muted)] transition hover:text-[var(--color-primary)]">
          Register again
        </Link>
      </p>
    </div>
  );
}
