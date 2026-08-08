import { FormEvent, useEffect, useState } from 'react';
import Button from '../../../components/common/Button';
import Input from '../../../components/common/Input';
import Loading from '../../../components/common/Loading';
import { getApiErrorMessage } from '../../../services/apiError';
import { adminApi, type AdminUser, type AdminUserStatus } from '../../../services/serverless/adminApi';

type InviteForm = { email: string; full_name: string; phone: string };
const emptyForm: InviteForm = { email: '', full_name: '', phone: '' };

export default function AdminAccountsPage() {
  const [accounts, setAccounts] = useState<AdminUser[]>([]);
  const [form, setForm] = useState<InviteForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [busySub, setBusySub] = useState('');
  const [nextToken, setNextToken] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadAccounts = async (paginationToken?: string) => {
    setLoading(true);
    try {
      const page = await adminApi.listAdminAccounts({ pageSize: 60, ...(paginationToken ? { paginationToken } : {}) });
      setAccounts(page.items);
      setNextToken(page.next_token);
      setError('');
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Unable to load Admin accounts.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadAccounts(); }, 0);
    return () => window.clearTimeout(timer);
    // The page owns its initial request.
  }, []);

  const invite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.email.trim() || !form.full_name.trim() || busySub) return;
    setBusySub('new');
    setError('');
    setMessage('');
    try {
      const created = await adminApi.createAdminAccount({
        email: form.email.trim(),
        full_name: form.full_name.trim(),
        ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
      });
      setAccounts((current) => [created, ...current]);
      setForm(emptyForm);
      setMessage('Invitation sent. The new Admin must complete the Cognito email flow.');
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Unable to invite Admin account.'));
    } finally {
      setBusySub('');
    }
  };

  const changeStatus = async (account: AdminUser) => {
    if (account.is_primary_admin || busySub) return;
    const nextStatus: AdminUserStatus = account.status === 'ACTIVE' ? 'BANNED' : 'ACTIVE';
    if (!window.confirm(`${nextStatus === 'BANNED' ? 'Disable' : 'Enable'} this Admin account?`)) return;
    setBusySub(account.sub);
    setError('');
    try {
      const updated = await adminApi.updateAdminAccountStatus(account.sub, nextStatus);
      setAccounts((current) => current.map((item) => item.sub === updated.sub ? updated : item));
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Unable to update Admin status.'));
    } finally {
      setBusySub('');
    }
  };

  const resetInvitation = async (account: AdminUser) => {
    if (account.is_primary_admin || busySub) return;
    if (!window.confirm('Send a new Cognito invitation email?')) return;
    setBusySub(account.sub);
    setError('');
    setMessage('');
    try {
      const updated = await adminApi.resetAdminInvitation(account.sub);
      setAccounts((current) => current.map((item) => item.sub === updated.sub ? updated : item));
      setMessage('Invitation reset email sent.');
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Unable to reset invitation.'));
    } finally {
      setBusySub('');
    }
  };

  return (
    <section className="mx-auto max-w-7xl px-6 py-10 sm:py-14">
      <span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[var(--color-primary)]">Admin console</span>
      <h1 className="mt-2 font-display text-4xl">Admin accounts</h1>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">Invite and manage Admin access through Cognito. Passwords stay inside the Cognito email flow.</p>

      <form className="mt-8 grid gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end" onSubmit={invite}>
        <Input label="Email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="admin@example.com" />
        <Input label="Full name" value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} placeholder="Admin name" />
        <Input label="Phone (optional)" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="+61..." />
        <Button type="submit" disabled={busySub === 'new' || !form.email.trim() || !form.full_name.trim()}>Invite</Button>
      </form>

      {error && <p className="mt-6 rounded-xl border border-[var(--color-danger-solid)]/60 px-5 py-4 text-sm text-[var(--color-danger)]">{error}</p>}
      {message && <p className="mt-6 rounded-xl border border-[var(--color-success-border)] px-5 py-4 text-sm text-[var(--color-success)]">{message}</p>}

      <section className="mt-8 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        {loading ? <Loading /> : accounts.length === 0 ? <p className="px-6 py-16 text-center text-sm text-[var(--color-text-muted)]">No Admin accounts found.</p> : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-[var(--color-border)] text-xs uppercase tracking-wider text-[var(--color-text-dim)]"><tr><th className="px-5 py-4 font-normal">Account</th><th className="px-5 py-4 font-normal">Status</th><th className="px-5 py-4 font-normal">Actions</th></tr></thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {accounts.map((account) => <tr key={account.sub}>
                  <td className="px-5 py-4"><p>{account.email || '-'}</p><p className="mt-1 text-xs text-[var(--color-text-muted)]">{account.full_name || '-'} · {account.sub}</p></td>
                  <td className="px-5 py-4"><span className={account.status === 'ACTIVE' ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}>{account.status}</span>{account.is_primary_admin && <span className="ml-2 text-xs text-[var(--color-primary)]">Bootstrap</span>}</td>
                  <td className="px-5 py-4"><div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" disabled={account.is_primary_admin || Boolean(busySub)} onClick={() => void changeStatus(account)}>{account.status === 'ACTIVE' ? 'Disable' : 'Enable'}</Button><Button type="button" variant="ghost" disabled={account.is_primary_admin || Boolean(busySub)} onClick={() => void resetInvitation(account)}>Reset invitation</Button></div></td>
                </tr>)}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <div className="mt-5 flex justify-end">{nextToken && <Button type="button" variant="secondary" disabled={loading} onClick={() => void loadAccounts(nextToken)}>Next page</Button>}</div>
    </section>
  );
}
