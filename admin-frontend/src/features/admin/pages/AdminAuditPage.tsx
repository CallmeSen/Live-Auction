import { FormEvent, useEffect, useState } from 'react';
import { adminApi, type AdminAuditEvent } from '../../../services/serverless/adminApi';
import Button from '../../../components/common/Button';
import Input from '../../../components/common/Input';
import Loading from '../../../components/common/Loading';
import { getApiErrorMessage } from '../../../services/apiError';

function dateTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString();
}

export default function AdminAuditPage() {
  const [events, setEvents] = useState<AdminAuditEvent[]>([]);
  const [actorSub, setActorSub] = useState('');
  const [action, setAction] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [outcome, setOutcome] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [nextToken, setNextToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async (paginationToken?: string) => {
    setLoading(true);
    try {
      const page = await adminApi.listAuditEvents({
        pageSize: 50,
        ...(actorSub.trim() ? { actorSub: actorSub.trim() } : {}),
        ...(action.trim() ? { action: action.trim() } : {}),
        ...(resourceType.trim() ? { resourceType: resourceType.trim() } : {}),
        ...(outcome ? { outcome } : {}),
        ...(from ? { from: Number(from) } : {}),
        ...(to ? { to: Number(to) } : {}),
        ...(paginationToken ? { paginationToken } : {}),
      });
      setEvents(page.items);
      setNextToken(page.next_token);
      setError('');
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Unable to load audit events.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
    // The page owns its initial request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void load();
  };

  return (
    <section className="mx-auto max-w-7xl px-6 py-10 sm:py-14">
      <span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[var(--color-primary)]">Admin console</span>
      <h1 className="mt-2 font-display text-4xl">Audit history</h1>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">Review safe Admin mutations without exposing credential material.</p>

      <form className="mt-8 grid gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 md:grid-cols-2 lg:grid-cols-4" onSubmit={submit}>
        <Input label="Actor sub" value={actorSub} onChange={(event) => setActorSub(event.target.value)} placeholder="Cognito subject" />
        <Input label="Action" value={action} onChange={(event) => setAction(event.target.value)} placeholder="CATEGORY_CREATED" />
        <Input label="Resource type" value={resourceType} onChange={(event) => setResourceType(event.target.value)} placeholder="CATEGORY" />
        <label className="flex flex-col gap-1.5 text-xs font-mono-tag uppercase tracking-wider text-[var(--color-text-muted)]">Outcome<select value={outcome} onChange={(event) => setOutcome(event.target.value)} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-4 py-2.5 text-sm"><option value="">All</option><option value="SUCCESS">Success</option><option value="CONFLICT">Conflict</option></select></label>
        <Input label="From (epoch)" value={from} onChange={(event) => setFrom(event.target.value)} inputMode="numeric" />
        <Input label="To (epoch)" value={to} onChange={(event) => setTo(event.target.value)} inputMode="numeric" />
        <div className="flex items-end"><Button type="submit">Search</Button></div>
      </form>

      {error && <p className="mt-6 rounded-xl border border-[var(--color-danger-solid)]/60 px-5 py-4 text-sm text-[var(--color-danger)]">{error}</p>}
      <section className="mt-8 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        {loading ? <Loading /> : events.length === 0 ? <p className="px-6 py-16 text-center text-sm text-[var(--color-text-muted)]">No audit events found.</p> : (
          <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-[var(--color-border)] text-xs uppercase tracking-wider text-[var(--color-text-dim)]"><tr><th className="px-5 py-4 font-normal">Time</th><th className="px-5 py-4 font-normal">Action</th><th className="px-5 py-4 font-normal">Resource</th><th className="px-5 py-4 font-normal">Actor</th><th className="px-5 py-4 font-normal">Request</th></tr></thead><tbody className="divide-y divide-[var(--color-border)]">{events.map((event) => <tr key={event.event_id}><td className="px-5 py-4 text-xs text-[var(--color-text-muted)]">{dateTime(event.timestamp)}</td><td className="px-5 py-4"><p>{event.action}</p><p className="mt-1 text-xs text-[var(--color-text-dim)]">{event.outcome}</p></td><td className="px-5 py-4 text-xs">{event.resource_type} · {event.resource_id}</td><td className="px-5 py-4 font-mono text-xs text-[var(--color-text-muted)]">{event.actor_sub}</td><td className="px-5 py-4 font-mono text-xs text-[var(--color-text-muted)]">{event.request_id}</td></tr>)}</tbody></table></div>
        )}
      </section>
      <div className="mt-5 flex justify-end">{nextToken && <Button type="button" variant="secondary" disabled={loading} onClick={() => void load(nextToken)}>Older events</Button>}</div>
    </section>
  );
}
