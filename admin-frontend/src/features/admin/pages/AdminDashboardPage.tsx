import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { catalogApi, type AdminDashboard } from '../../../services/serverless/catalogApi';
import { getApiErrorMessage } from '../../../services/apiError';
import { formatDateTime } from '../../../utils/formatDate';

export default function AdminDashboardPage() {
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const result = await catalogApi.getDashboard();
        if (active) {
          setDashboard(result);
          setError('');
        }
      } catch (requestError) {
        if (active) setError(getApiErrorMessage(requestError, 'Unable to load dashboard data.'));
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, []);

  const cards = [
    { label: 'Recent sessions', value: dashboard?.recentSessions.length ?? 0, detail: 'Bounded operational list', to: '/admin/auctions' },
    { label: 'Live sessions', value: dashboard?.sessionCounts.LIVE ?? 0, detail: 'Server-side status count', to: '/admin/auctions' },
    { label: 'Items awaiting review', value: dashboard?.itemCounts.PENDING_ADMIN_APPROVAL ?? 0, detail: 'Ready for item moderation', to: '/admin/auctions' },
  ];

  return (
    <div className="mx-auto max-w-7xl px-6 py-10 sm:py-14">
      <span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[var(--color-primary)]">Admin console</span>
      <h1 className="mt-2 font-display text-4xl">System overview</h1>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">Bounded operational counts and recent auction activity.</p>

      {error && <p className="mt-7 rounded-xl border border-[var(--color-danger-solid)]/60 px-5 py-4 text-sm text-[var(--color-danger)]">{error}</p>}

      <div className="mt-9 grid gap-4 md:grid-cols-3">
        {loading
          ? Array.from({ length: 3 }, (_, index) => <div key={index} className="h-32 animate-pulse rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]" />)
          : cards.map((card) => (
            <Link key={card.label} to={card.to} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 transition hover:border-[var(--color-primary)]">
              <p className="text-xs uppercase tracking-wider text-[var(--color-text-dim)]">{card.label}</p>
              <p className="mt-3 font-display text-3xl">{card.value}</p>
              <p className="mt-2 text-xs text-[var(--color-text-muted)]">{card.detail}</p>
            </Link>
          ))}
      </div>

      {!loading && !error && dashboard && (
        <section className="mt-8 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl">Recent sessions</h2>
              {dashboard.truncated && <p className="mt-1 text-xs text-[var(--color-warning)]">Some counts are bounded at the configured safety limit.</p>}
            </div>
            <Link to="/admin/auctions" className="text-xs text-[var(--color-primary)]">Open moderation</Link>
          </div>
          <div className="mt-5 space-y-3">
            {dashboard.recentSessions.length > 0 ? dashboard.recentSessions.map((session) => (
              <div key={session.id} className="flex items-center gap-4 rounded-lg border border-[var(--color-border)] p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{session.title}</p>
                  <p className="mt-1 text-xs text-[var(--color-text-dim)]">{session.status} · {session.startTime ? formatDateTime(new Date(session.startTime * 1000).toISOString()) : 'Not scheduled'}</p>
                </div>
                <Link to={`/auction-sessions/${session.id}`} className="text-xs text-[var(--color-primary)]">View</Link>
              </div>
            )) : <p className="py-8 text-center text-sm text-[var(--color-text-dim)]">No auction sessions yet.</p>}
          </div>
        </section>
      )}
    </div>
  );
}
