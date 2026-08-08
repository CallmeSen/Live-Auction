import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Button from '../../../components/common/Button';
import Input from '../../../components/common/Input';
import { cognitoAccountService } from '../../../auth/cognito';

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError('Email is required.');
      return;
    }

    setLoading(true);
    try {
      await cognitoAccountService.resetPassword(normalizedEmail);
      navigate(`/reset-password?email=${encodeURIComponent(normalizedEmail)}`);
    } catch {
      setError('Unable to send a reset code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[var(--color-primary)]">Account recovery</span>
      <h2 className="mt-2 font-display text-3xl text-[var(--color-text)]">Forgot password?</h2>
      <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
        Enter your registered email and Cognito will send a reset code.
      </p>

      <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-4">
        <Input
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={error}
        />
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? 'Sending...' : 'Send reset code'}
        </Button>
      </form>

      <p className="mt-7 text-center text-sm">
        <Link to="/login" className="text-[var(--color-text-muted)] transition hover:text-[var(--color-primary)]">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
