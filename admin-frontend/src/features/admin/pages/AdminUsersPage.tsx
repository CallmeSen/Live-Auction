import { FormEvent, useEffect, useState } from 'react';
import Button from '../../../components/common/Button';
import Input from '../../../components/common/Input';
import Loading from '../../../components/common/Loading';
import { getApiErrorMessage } from '../../../services/apiError';
import {
  adminApi,
  type AdminUser,
  type AdminUserStatus,
} from '../../../services/serverless/adminApi';

function display(value: string | null): string {
  return value || '-';
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<AdminUserStatus | ''>('');
  const [loading, setLoading] = useState(true);
  const [busySub, setBusySub] = useState<string | null>(null);
  const [nextToken, setNextToken] = useState<string | null>(null);
  const [error, setError] = useState('');

  const loadUsers = async (search = keyword, nextStatus = status, paginationToken?: string) => {
    setLoading(true);
    try {
      const page = await adminApi.listUsers({
        pageSize: 60,
        ...(search.trim() ? { keyword: search.trim() } : {}),
        ...(nextStatus ? { status: nextStatus } : {}),
        ...(paginationToken ? { paginationToken } : {}),
      });
      setUsers(page.items);
      setNextToken(page.next_token);
      setError('');
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Unable to load users.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadUsers('', '', undefined); }, 0);
    return () => window.clearTimeout(timer);
    // The page owns the initial request; searches are submitted explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void loadUsers();
  };

  const changeStatus = async (user: AdminUser) => {
    const nextStatus: AdminUserStatus = user.status === 'ACTIVE' ? 'BANNED' : 'ACTIVE';
    if (!window.confirm(`${nextStatus === 'BANNED' ? 'Disable' : 'Enable'} this account?`)) return;
    setBusySub(user.sub);
    try {
      const updated = await adminApi.updateUserStatus(user.sub, nextStatus);
      setUsers((current) => current.map((item) => item.sub === updated.sub ? updated : item));
      setError('');
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Unable to update user status.'));
    } finally {
      setBusySub(null);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-10 sm:py-14">
      <span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[var(--color-primary)]">Admin console</span>
      <h1 className="mt-2 font-display text-4xl">User management</h1>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">Review Cognito accounts and update user access.</p>

      <form className="mt-8 grid gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 md:grid-cols-[minmax(0,1fr)_12rem_auto] md:items-end" onSubmit={submitSearch}>
        <Input
          label="Search"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="Email, name, or user id"
        />
        <label className="flex flex-col gap-1.5 text-xs font-mono-tag uppercase tracking-wider text-[var(--color-text-muted)]" htmlFor="user-status">
          Status
          <select
            id="user-status"
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-4 py-2.5 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none"
            value={status}
            onChange={(event) => setStatus(event.target.value as AdminUserStatus | '')}
          >
            <option value="">All</option>
            <option value="ACTIVE">Active</option>
            <option value="BANNED">Banned</option>
          </select>
        </label>
        <Button type="submit">Search</Button>
      </form>

      {error && <p className="mt-6 rounded-xl border border-[var(--color-danger-solid)]/60 px-5 py-4 text-sm text-[var(--color-danger)]">{error}</p>}

      <section className="mt-8 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        {loading ? <Loading /> : users.length === 0 ? (
          <p className="px-6 py-16 text-center text-sm text-[var(--color-text-muted)]">No users found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-[var(--color-border)] text-xs uppercase tracking-wider text-[var(--color-text-dim)]">
                <tr>
                  <th className="px-5 py-4 font-normal">User</th>
                  <th className="px-5 py-4 font-normal">Role</th>
                  <th className="px-5 py-4 font-normal">Status</th>
                  <th className="px-5 py-4 font-normal">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {users.map((user) => (
                  <tr key={user.sub}>
                    <td className="px-5 py-4">
                      <p>{display(user.email)}</p>
                      <p className="mt-1 text-xs text-[var(--color-text-muted)]">{display(user.full_name)}</p>
                    </td>
                    <td className="px-5 py-4 text-xs uppercase text-[var(--color-text-muted)]">{user.role}</td>
                    <td className="px-5 py-4">
                      <span className={user.status === 'ACTIVE' ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}>
                        {user.status}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={user.is_primary_admin || busySub === user.sub}
                        onClick={() => void changeStatus(user)}
                        aria-label={user.status === 'ACTIVE' ? 'Disable' : 'Enable'}
                      >
                        {user.status === 'ACTIVE' ? 'Disable' : 'Enable'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <div className="mt-5 flex justify-end">{nextToken && <Button type="button" variant="secondary" disabled={loading} onClick={() => void loadUsers(keyword, status, nextToken)}>Next page</Button>}</div>
    </div>
  );
}
