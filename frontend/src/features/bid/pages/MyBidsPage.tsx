import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type {
  MyBidListItemResponse,
  MyBidOutcome,
} from '../../../interfaces/bid';
import { getApiErrorMessage } from '../../../services/apiError';
import { bidService } from '../../../services/bidService';
import { formatCurrency } from '../../../utils/formatCurrency';
import { formatDateTime } from '../../../utils/formatDate';

type BidFilter = 'ALL' | 'ACTIVE' | 'WON' | 'LOST';

const outcomeStyle: Record<
  MyBidOutcome,
  { label: string; className: string }
> = {
  LEADING: {
    label: 'Đang dẫn đầu',
    className:
      'bg-[var(--color-success-bg)]/20 text-[var(--color-success)] border-[var(--color-success-border)]/30',
  },
  OUTBID: {
    label: 'Đã bị vượt',
    className:
      'bg-[var(--color-danger-solid)]/10 text-[var(--color-danger)] border-[var(--color-danger-solid)]/30',
  },
  WON: {
    label: 'Đã thắng',
    className:
      'bg-[var(--color-primary)]/15 text-[var(--color-primary)] border-[var(--color-primary)]/40',
  },
  LOST: {
    label: 'Không thắng',
    className:
      'bg-[var(--color-surface-alt)] text-[var(--color-text-muted)] border-[var(--color-border-strong)]',
  },
};

const filters: Array<{ value: BidFilter; label: string }> = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'ACTIVE', label: 'Đang tham gia' },
  { value: 'WON', label: 'Đã thắng' },
  { value: 'LOST', label: 'Không thắng' },
];

const isInFilter = (
  bid: MyBidListItemResponse,
  filter: BidFilter,
) => {
  if (filter === 'ALL') {
    return true;
  }

  if (filter === 'ACTIVE') {
    return bid.outcome === 'LEADING' || bid.outcome === 'OUTBID';
  }

  return bid.outcome === filter;
};

export default function MyBidsPage() {
  const [bids, setBids] = useState<MyBidListItemResponse[]>([]);
  const [selectedFilter, setSelectedFilter] =
    useState<BidFilter>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadBids = async () => {
      try {
        const data = await bidService.getMyBids({
          page: 1,
          pageSize: 100,
        });

        if (!cancelled) {
          setBids(data.items);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            getApiErrorMessage(
              loadError,
              'Không thể tải danh sách vật phẩm đã trả giá.',
            ),
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadBids();

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredBids = useMemo(
    () => bids.filter((bid) => isInFilter(bid, selectedFilter)),
    [bids, selectedFilter],
  );

  const countByFilter = (filter: BidFilter) =>
    bids.filter((bid) => isInFilter(bid, filter)).length;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 sm:py-14">
      <span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[var(--color-primary)]">
        Hoạt động cá nhân
      </span>

      <h1 className="mt-2 font-display text-4xl">
        Vật phẩm tôi đã trả giá
      </h1>

      <p className="mt-2 text-sm text-[var(--color-text-muted)]">
        Mỗi vật phẩm chỉ hiển thị một lần với giá cao nhất bạn đã đặt.
      </p>

      <div className="mt-8 flex gap-2 overflow-x-auto">
        {filters.map((filter) => (
          <button
            type="button"
            key={filter.value}
            onClick={() => setSelectedFilter(filter.value)}
            className={`whitespace-nowrap rounded-full border px-4 py-2 text-xs ${selectedFilter === filter.value
              ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-bg)]'
              : 'border-[var(--color-border-strong)] text-[var(--color-text-muted)]'
            }`}
          >
            {filter.label} {countByFilter(filter.value)}
          </button>
        ))}
      </div>

      {loading && (
        <p className="mt-8 text-sm text-[var(--color-text-muted)]">
          Đang tải danh sách vật phẩm...
        </p>
      )}

      {error && (
        <p className="mt-8 rounded-lg border border-[var(--color-danger-border)] p-4 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}

      {!loading && !error && filteredBids.length === 0 && (
        <div className="mt-8 rounded-xl border border-dashed border-[var(--color-border-strong)] py-16 text-center">
          <p className="font-display text-xl">
            Chưa có vật phẩm phù hợp
          </p>

          <Link
            to="/auctions"
            className="mt-3 inline-block text-sm text-[var(--color-primary)]"
          >
            Khám phá các phiên đấu giá
          </Link>
        </div>
      )}

      <div className="mt-6 space-y-4">
        {filteredBids.map((bid) => {
          const outcome = outcomeStyle[bid.outcome];
          const displayedPrice =
            bid.itemFinalPrice ?? bid.itemCurrentPrice;
          const canBidAgain = bid.outcome === 'OUTBID';

          return (
            <article
              key={bid.itemId}
              className="grid gap-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:grid-cols-[1fr_auto] sm:items-center"
            >
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-wider ${outcome.className}`}
                  >
                    {outcome.label}
                  </span>

                  <span className="rounded-full border border-[var(--color-border-strong)] px-3 py-1 text-[10px] text-[var(--color-text-soft)]">
                    {bid.sessionStatus}
                  </span>

                  <span className="text-xs text-[var(--color-text-dim)]">
                    Lần trả gần nhất: {formatDateTime(bid.createdAt)}
                  </span>
                </div>

                <h2 className="mt-2 font-display text-xl">
                  {bid.itemTitle}
                </h2>

                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                  Phiên: {bid.sessionTitle}
                </p>

                <div className="mt-3 flex flex-wrap gap-6 text-xs text-[var(--color-text-muted)]">
                  <span>
                    Giá cao nhất của bạn
                    <strong className="ml-1 font-medium text-[var(--color-text)]">
                      {formatCurrency(Number(bid.amount))}
                    </strong>
                  </span>

                  <span>
                    {bid.outcome === 'WON' || bid.outcome === 'LOST'
                      ? 'Giá chốt'
                      : 'Giá hiện tại'}
                    <strong className="ml-1 font-medium text-[var(--color-primary)]">
                      {formatCurrency(Number(displayedPrice))}
                    </strong>
                  </span>
                </div>
              </div>

              <Link
                to={`/auction-items/${bid.itemId}`}
                className={`rounded-md px-4 py-2.5 text-center text-sm font-semibold transition ${canBidAgain
                  ? 'bg-[var(--color-primary)] text-[var(--color-bg)] hover:bg-[var(--color-primary-hover)]'
                  : 'border border-[var(--color-border-strong)] text-[var(--color-text)] hover:border-[var(--color-primary)]'
                }`}
              >
                {canBidAgain ? 'Đặt giá lại' : 'Xem vật phẩm'}
              </Link>
            </article>
          );
        })}
      </div>
    </div>
  );
}
