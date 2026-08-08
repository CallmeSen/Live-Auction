import { useEffect, useState, type ReactNode } from 'react';
import type { AuthRole } from '../../auth/types';
import type { ConnectionState } from './useAuctionRoom';
import { formatCountdown, secondsRemaining } from './countdown';

type AuctionRoomPanelProps = {
  connectionState: ConnectionState;
  currentPrice: string | null;
  endTime: number | null;
  highestBidderAlias: string | null;
  bidderAlias: string | null;
  extensionCount: number;
  role?: AuthRole;
  bidControl?: ReactNode;
  onRetry(): void;
  now?: () => number;
};

const defaultNow = () => Date.now();

const STATUS_LABELS: Record<ConnectionState, string> = {
  loading: 'Đang tải dữ liệu trực tiếp',
  connecting: 'Đang kết nối',
  joined: 'Đã kết nối',
  reconnecting: 'Đang kết nối lại',
  offline: 'Đang ngoại tuyến',
  failed: 'Kết nối thất bại',
  closed: 'Phiên trực tiếp đã đóng',
};

export default function AuctionRoomPanel({
  connectionState,
  currentPrice,
  endTime,
  highestBidderAlias,
  bidderAlias,
  extensionCount,
  role,
  bidControl,
  onRetry,
  now = defaultNow,
}: AuctionRoomPanelProps) {
  const [nowMs, setNowMs] = useState(() => now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(now()), 1_000);
    return () => window.clearInterval(timer);
  }, [now]);

  const remaining = endTime === null ? 0 : secondsRemaining(endTime, nowMs);
  const ended = endTime !== null && remaining === 0;

  return (
    <aside className="min-w-0 border-l-2 border-[var(--color-primary)] pl-5 sm:pl-8">
      <div
        role="status"
        aria-label="Live connection status"
        aria-live="polite"
        className="min-h-6 text-xs font-semibold text-[var(--color-primary)]"
      >
        {STATUS_LABELS[connectionState]}
      </div>

      <div className="mt-6 grid min-w-0 grid-cols-2 gap-x-5 gap-y-6">
        <section aria-label="Giá hiện tại" className="col-span-2 min-w-0 border-b border-[var(--color-border)] pb-6">
          <p className="text-xs text-[var(--color-text-muted)]">Giá hiện tại</p>
          <p className="mt-2 break-words font-display text-4xl text-[var(--color-text)]">
            {currentPrice ?? '---'}
          </p>
        </section>

        <section aria-label="Thời gian còn lại" className="min-h-20 min-w-0">
          <p className="text-xs text-[var(--color-text-muted)]">Thời gian còn lại</p>
          <p className="mt-2 font-mono text-xl font-semibold tabular-nums sm:text-2xl">
            {ended ? 'Đã kết thúc' : endTime === null ? '--:--' : formatCountdown(remaining)}
          </p>
        </section>

        <section aria-label="Người đang dẫn đầu" className="min-h-20 min-w-0">
          <p className="text-xs text-[var(--color-text-muted)]">Đang dẫn đầu</p>
          <p className="mt-2 break-words text-sm font-semibold">
            {highestBidderAlias ?? 'Chưa có'}
          </p>
        </section>

        <section className="col-span-2 grid min-w-0 gap-3 border-y border-[var(--color-border)] py-5 text-sm sm:grid-cols-2">
          <p className="min-w-0 break-words">
            <span className="text-[var(--color-text-dim)]">Bí danh của bạn: </span>
            {bidderAlias ?? 'Đang cấp bí danh'}
          </p>
          <p className="min-w-0 sm:text-right">
            {extensionCount} lần gia hạn
          </p>
        </section>
      </div>

      {connectionState === 'failed' && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 w-full rounded-md border border-[var(--color-border-strong)] px-4 py-3 text-sm font-semibold"
        >
          Thử kết nối lại
        </button>
      )}

      {role === 'USER' && bidControl && (
        <section aria-label="Trả giá" className="mt-6 min-w-0">
          {bidControl}
        </section>
      )}
    </aside>
  );
}
