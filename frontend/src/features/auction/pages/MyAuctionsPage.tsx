import { useEffect, useRef, useState } from 'react';
import { CalendarClock, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { CatalogApi } from '../../../services/serverless/catalogApi';
import { ServerlessApiError } from '../../../services/serverless/contracts';
import type { AuctionSession } from '../../../services/serverless/mappers';
import { useCatalogApi } from '../../../services/serverless/useCatalogApi';

const PAGE_SIZE = 12;
const BROWSER_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone
  || 'Múi giờ cục bộ';

type MyAuctionsPageProps = {
  catalogApi?: CatalogApi;
};

export default function MyAuctionsPage({ catalogApi }: MyAuctionsPageProps) {
  const api = useCatalogApi(catalogApi);
  const [sessions, setSessions] = useState<AuctionSession[]>([]);
  const [cursorStack, setCursorStack] = useState<Array<string | undefined>>([
    undefined,
  ]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState('');
  const [scheduleValues, setScheduleValues] = useState<Record<string, string>>({});
  const [schedulingId, setSchedulingId] = useState<string | null>(null);
  const scheduleInFlight = useRef(new Set<string>());
  const cursor = cursorStack[cursorStack.length - 1];

  useEffect(() => {
    let active = true;
    void api.listMySessions({
      pageSize: PAGE_SIZE,
      ...(cursor === undefined ? {} : { cursor }),
    }).then(
      (result) => {
        if (!active) return;
        setSessions(result.items);
        setNextCursor(result.nextCursor);
        setLoading(false);
      },
      () => {
        if (!active) return;
        setLoadError(true);
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [api, cursor, retryKey]);

  const schedule = async (session: AuctionSession, nowMs: number) => {
    if (scheduleInFlight.current.has(session.id)) return;
    const rawStartTime = scheduleValues[session.id] ?? '';
    const date = new Date(rawStartTime);
    if (!rawStartTime || Number.isNaN(date.getTime()) || date.getTime() <= nowMs) {
      setActionError('Thời gian bắt đầu phải ở tương lai.');
      return;
    }

    setActionError('');
    scheduleInFlight.current.add(session.id);
    setSchedulingId(session.id);
    try {
      const result = await api.scheduleSession(session.id, {
        start_time: Math.floor(date.getTime() / 1000),
      });
      setSessions((current) => current.map((item) => (
        item.id === session.id
          ? { ...item, status: result.status, startTime: result.startTime }
          : item
      )));
    } catch (error) {
      const code = error instanceof ServerlessApiError ? ` (${error.code})` : '';
      setActionError(`Không thể lập lịch phiên.${code}`);
    } finally {
      scheduleInFlight.current.delete(session.id);
      setSchedulingId(null);
    }
  };

  return (
    <main className="mx-auto max-w-7xl px-6 py-10 sm:py-14">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="font-mono-tag text-xs uppercase text-[var(--color-primary)]">
            Kênh người bán
          </p>
          <h1 className="mt-2 font-display text-4xl">Phiên đấu giá của tôi</h1>
        </div>
        <Link
          to="/auctions/create"
          className="inline-flex items-center justify-center gap-2 rounded-md bg-[var(--color-primary)] px-5 py-3 text-sm font-semibold text-[var(--color-bg)]"
        >
          <Plus aria-hidden="true" size={17} />
          Tạo phiên mới
        </Link>
      </div>

      {actionError && (
        <div role="alert" className="mt-7 border-y border-[var(--color-danger-solid)]/60 py-4 text-sm text-[var(--color-danger)]">
          {actionError}
        </div>
      )}

      {loading && (
        <div role="status" className="py-20 text-center text-sm text-[var(--color-text-muted)]">
          Đang tải phiên của bạn...
        </div>
      )}

      {!loading && loadError && (
        <div role="alert" className="mt-8 border-y border-[var(--color-danger-solid)]/60 py-10 text-center">
          <p className="text-sm text-[var(--color-danger)]">Không thể tải danh sách phiên của bạn.</p>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setLoadError(false);
              setRetryKey((value) => value + 1);
            }}
            className="mt-4 rounded-md border border-[var(--color-border-strong)] px-4 py-2 text-sm"
          >
            Thử lại
          </button>
        </div>
      )}

      {!loading && !loadError && sessions.length === 0 && (
        <div className="mt-8 border-y border-dashed border-[var(--color-border-strong)] py-16 text-center">
          <p className="font-display text-xl">Bạn chưa tạo phiên đấu giá nào.</p>
        </div>
      )}

      {!loading && !loadError && sessions.length > 0 && (
        <div className="mt-8 space-y-5">
          {sessions.map((session) => (
            <article
              key={session.id}
              className="grid gap-6 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 lg:grid-cols-[1fr_0.8fr]"
            >
              <div>
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <span className="rounded-full border border-[var(--color-border-strong)] px-3 py-1">
                    {session.status}
                  </span>
                  <span className="text-[var(--color-text-muted)]">
                    {session.itemCount} vật phẩm
                  </span>
                </div>
                <h2 className="mt-5 font-display text-2xl">{session.title}</h2>
                <p className="mt-3 text-sm leading-6 text-[var(--color-text-muted)]">
                  {session.description || 'Phiên chưa có mô tả.'}
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link
                    to={`/auction-sessions/${encodeURIComponent(session.id)}`}
                    className="rounded-md border border-[var(--color-border-strong)] px-4 py-2 text-sm"
                  >
                    Xem chi tiết
                  </Link>
                  {session.status === 'DRAFT' && (
                    <Link
                      to={`/auction-sessions/${encodeURIComponent(session.id)}/items/create`}
                      className="rounded-md border border-[var(--color-primary)]/50 px-4 py-2 text-sm text-[var(--color-primary)]"
                    >
                      Thêm vật phẩm
                    </Link>
                  )}
                </div>
              </div>

              {session.status === 'DRAFT' && session.itemCount > 0 ? (
                <div className="border-t border-[var(--color-border)] pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                  <label className="block text-sm">
                    <span className="text-[var(--color-text-muted)]">Thời gian bắt đầu</span>
                    <input
                      aria-label="Thời gian bắt đầu"
                      type="datetime-local"
                      value={scheduleValues[session.id] ?? ''}
                      onChange={(event) => setScheduleValues((current) => ({
                        ...current,
                        [session.id]: event.target.value,
                      }))}
                      className="mt-2 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-4 py-3"
                    />
                    <span className="mt-2 block text-xs text-[var(--color-text-dim)]">
                      Múi giờ: {BROWSER_TIME_ZONE}
                    </span>
                  </label>
                  <button
                    type="button"
                    disabled={schedulingId === session.id}
                    onClick={() => void schedule(session, Date.now())}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-[var(--color-primary)] px-4 py-3 text-sm font-semibold text-[var(--color-bg)] disabled:opacity-50"
                  >
                    <CalendarClock aria-hidden="true" size={17} />
                    {schedulingId === session.id ? 'Đang lập lịch...' : 'Lập lịch'}
                  </button>
                </div>
              ) : session.status === 'DRAFT' ? (
                <p className="self-center text-sm text-[var(--color-text-muted)]">
                  Hãy thêm ít nhất một vật phẩm trước khi lập lịch.
                </p>
              ) : (
                <p className="self-center text-sm text-[var(--color-text-muted)]">
                  Bắt đầu: {session.startTime
                    ? new Date(session.startTime * 1000).toLocaleString('vi-VN')
                    : 'Chưa có thời gian'}
                </p>
              )}
            </article>
          ))}
        </div>
      )}

      {!loading && !loadError && (cursorStack.length > 1 || nextCursor !== null) && (
        <nav aria-label="Phân trang" className="mt-9 flex justify-center gap-3">
          <button
            type="button"
            disabled={cursorStack.length === 1}
            onClick={() => {
              setLoading(true);
              setLoadError(false);
              setCursorStack((current) => current.slice(0, -1));
            }}
            className="rounded-md border border-[var(--color-border-strong)] px-4 py-2 text-sm disabled:opacity-40"
          >
            Trang trước
          </button>
          <button
            type="button"
            disabled={nextCursor === null}
            onClick={() => {
              if (nextCursor !== null) {
                if (cursorStack.includes(nextCursor)) {
                  setActionError('Phản hồi phân trang không hợp lệ.');
                  return;
                }
                setLoading(true);
                setLoadError(false);
                setCursorStack((current) => [...current, nextCursor]);
              }
            }}
            className="rounded-md border border-[var(--color-border-strong)] px-4 py-2 text-sm disabled:opacity-40"
          >
            Trang sau
          </button>
        </nav>
      )}
    </main>
  );
}
