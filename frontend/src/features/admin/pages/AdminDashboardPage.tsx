import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AuctionSessionListItemResponse } from '../../../interfaces/auctionSession';
import { userService } from '../../../services/userService';
import { auctionSessionService } from '../../../services/auctionSessionService';
import { categoryService } from '../../../services/categoryService';
import { getApiErrorMessage } from '../../../services/apiError';
import { formatDateTime } from '../../../utils/formatDate';

export default function AdminDashboardPage() {
  const [sessions, setSessions] = useState<AuctionSessionListItemResponse[]>([]);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [activeTotal, setActiveTotal] = useState(0);
  const [categoryTotal, setCategoryTotal] = useState(0);
  const [userTotal, setUserTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadDashboard = async () => {
      try {
        const [
          sessionResult,
          activeResult,
          categoryResult,
          userResult,
        ] = await Promise.all([
          auctionSessionService.getAdminSessions({ page: 1, size: 5 }),
          auctionSessionService.getAdminSessions({
            page: 1,
            size: 1,
            status: 'ACTIVE',
          }),
          categoryService.getCategories({ page: 1, size: 1 }),
          userService.getUsers({ page: 1, pageSize: 1 }),
        ]);

        if (!cancelled) {
          setSessions(sessionResult.items);
          setSessionTotal(sessionResult.total);
          setActiveTotal(activeResult.total);
          setCategoryTotal(categoryResult.total);
          setUserTotal(userResult.pagination.totalItems);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(
            getApiErrorMessage(
              requestError,
              'Không thể tải dữ liệu tổng quan.',
            ),
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadDashboard();

    return () => {
      cancelled = true;
    };
  }, []);

  const cards = [
    {
      label: 'Người dùng',
      value: userTotal,
      detail: 'Tài khoản trong hệ thống',
      to: '/admin/users',
    },
    {
      label: 'Phiên đấu giá',
      value: sessionTotal,
      detail: `${activeTotal} phiên đang diễn ra`,
      to: '/admin/auctions',
    },
    {
      label: 'Danh mục',
      value: categoryTotal,
      detail: 'Danh mục trong hệ thống',
      to: '/admin/categories',
    },
  ];

  return (
    <div className="mx-auto max-w-7xl px-6 py-10 sm:py-14">
      <span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[var(--color-primary)]">
        Admin console
      </span>
      <h1 className="mt-2 font-display text-4xl">Tổng quan hệ thống</h1>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">
        Theo dõi người dùng, phiên đấu giá và danh mục từ backend.
      </p>

      {error && (
        <p className="mt-7 rounded-xl border border-[var(--color-danger-solid)]/60 px-5 py-4 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}

      <div className="mt-9 grid gap-4 md:grid-cols-3">
        {loading
          ? Array.from({ length: 3 }, (_, index) => (
              <div
                key={index}
                className="h-32 animate-pulse rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]"
              />
            ))
          : cards.map((card) => (
              <Link
                key={card.label}
                to={card.to}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 transition hover:border-[var(--color-primary)]"
              >
                <p className="text-xs uppercase tracking-wider text-[var(--color-text-dim)]">
                  {card.label}
                </p>
                <p className="mt-3 font-display text-3xl">{card.value}</p>
                <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                  {card.detail}
                </p>
              </Link>
            ))}
      </div>

      {!loading && !error && (
        <div className="mt-8 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-2xl">Phiên đấu giá gần đây</h2>
              <Link
                to="/admin/auctions"
                className="text-xs text-[var(--color-primary)]"
              >
                Xem tất cả →
              </Link>
            </div>

            <div className="mt-5 space-y-3">
              {sessions.length > 0 ? (
                sessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center gap-4 rounded-lg border border-[var(--color-border)] p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{session.title}</p>
                      <p className="mt-1 text-xs text-[var(--color-text-dim)]">
                        {session.status} · {formatDateTime(session.startTime)}
                      </p>
                    </div>
                    <Link
                      to={`/auction-sessions/${session.id}`}
                      className="text-xs text-[var(--color-primary)]"
                    >
                      Kiểm tra
                    </Link>
                  </div>
                ))
              ) : (
                <p className="py-8 text-center text-sm text-[var(--color-text-dim)]">
                  Chưa có phiên đấu giá.
                </p>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
            <h2 className="font-display text-2xl">Tác vụ nhanh</h2>
            <div className="mt-5 grid gap-3">
              {[
                ['Quản lý người dùng', '/admin/users'],
                ['Kiểm duyệt phiên', '/admin/auctions'],
                ['Quản lý danh mục', '/admin/categories'],
                ['Xem hồ sơ Admin', '/profile'],
              ].map(([label, to]) => (
                <Link
                  key={to}
                  to={to}
                  className="flex items-center justify-between rounded-lg border border-[var(--color-border)] px-4 py-3 text-sm text-[var(--color-text-soft)] hover:border-[var(--color-primary)] hover:text-[var(--color-text)]"
                >
                  <span>{label}</span>
                  <span>→</span>
                </Link>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
