import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Input from '../../../components/common/Input';
import Button from '../../../components/common/Button';
import type { RegisterForm } from '../types';
import { cognitoAccountService } from '../../../auth/cognito';

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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (form.fullName.trim().length < 2) {
      setError('Full name must contain at least 2 characters.');
      return;
    }
    if (form.password.length < 12) {
      setError('Password must contain at least 12 characters.');
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    const normalizedPhone = form.phone.replace(/[\s-]/g, '');
    if (!/^\+?\d{9,15}$/.test(normalizedPhone)) {
      setError('Phone number must contain 9 to 15 digits.');
      return;
    }

    setLoading(true);
    try {
      const email = form.email.trim().toLowerCase();
      await cognitoAccountService.signUp({
        fullName: form.fullName.trim(),
        email,
        phone: normalizedPhone,
        password: form.password,
      });
      navigate(`/confirm-signup?email=${encodeURIComponent(email)}`, {
        replace: true,
        state: { from },
      });
    } catch {
      setError('Unable to create the account. Please check the form and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[var(--color-primary)]">Register</span>
      <h2 className="mt-2 font-display text-3xl text-[var(--color-text)]">Create a member account</h2>
      <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
        Confirm your email before joining an auction or creating your own session.
      </p>

      <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-4">
        <Input label="Full name" name="fullName" required value={form.fullName} onChange={(event) => setForm((previous) => ({ ...previous, fullName: event.target.value }))} />
        <Input label="Email" type="email" name="email" autoComplete="email" required value={form.email} onChange={(event) => setForm((previous) => ({ ...previous, email: event.target.value }))} />
        <Input label="Phone" type="tel" name="phone" autoComplete="tel" required value={form.phone} onChange={(event) => setForm((previous) => ({ ...previous, phone: event.target.value }))} />
        <Input label="Password" type="password" name="password" autoComplete="new-password" minLength={12} required value={form.password} onChange={(event) => setForm((previous) => ({ ...previous, password: event.target.value }))} />
        <Input label="Confirm password" type="password" name="confirmPassword" autoComplete="new-password" minLength={12} required value={form.confirmPassword} onChange={(event) => setForm((previous) => ({ ...previous, confirmPassword: event.target.value }))} error={error} />
        <Button type="submit" disabled={loading} className="mt-1 w-full">
          {loading ? 'Creating account...' : 'Create account'}
        </Button>
      </form>

      <p className="mt-7 text-center text-sm text-[var(--color-text-muted)]">
        Already registered?{' '}
        <Link to="/login" state={{ from }} className="font-medium text-[var(--color-primary)]">Sign in</Link>
      </p>
    </div>
  );
}
