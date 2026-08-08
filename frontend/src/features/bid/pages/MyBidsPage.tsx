import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CatalogApi } from '../../../services/serverless/catalogApi';
import type { BidHistoryItem } from '../../../services/serverless/mappers';
import { useCatalogApi } from '../../../services/serverless/useCatalogApi';

const PAGE_SIZE = 20;

type MyBidsPageProps = {
  catalogApi?: CatalogApi;
};

export default function MyBidsPage({ catalogApi }: MyBidsPageProps) {
  const api = useCatalogApi(catalogApi);
  const [bids, setBids] = useState<BidHistoryItem[]>([]);
  const [cursorStack, setCursorStack] = useState<Array<string | undefined>>([
    undefined,
  ]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const cursor = cursorStack[cursorStack.length - 1];

  useEffect(() => {
    let active = true;
    void api.listMyBids({
      pageSize: PAGE_SIZE,
      ...(cursor === undefined ? {} : { cursor }),
    }).then(
      (result) => {
        if (!active) return;
        setBids(result.items);
        setNextCursor(result.nextCursor);
        setLoading(false);
      },
      () => {
        if (!active) return;
        setError(true);
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [api, cursor, retryKey]);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10 sm:py-14">
      <p className="font-mono-tag text-xs uppercase text-[var(--color-primary)]">
        Hoạt động của tôi
      </p>
      <h1 className="mt-3 font-display text-4xl text-[var(--color-text)]">
        Lịch sử trả giá
      </h1>

      {loading && (
        <div role="status" className="py-20 text-center text-sm text-[var(--color-text-muted)]">
          Đang tải lịch sử trả giá...
        </div>
      )}

      {!loading && error && (
        <div role="alert" className="mt-8 border-y border-[var(--color-danger-solid)]/60 py-10 text-center">
          <p className="text-sm text-[var(--color-danger)]">
            Không thể tải lịch sử trả giá.
          </p>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setError(false);
              setRetryKey((value) => value + 1);
            }}
            className="mt-4 rounded-md border border-[var(--color-border-strong)] px-4 py-2 text-sm"
          >
            Thử lại
          </button>
        </div>
      )}

      {!loading && !error && bids.length === 0 && (
        <div className="mt-8 border-y border-dashed border-[var(--color-border-strong)] py-16 text-center">
          <p className="font-display text-xl">Chưa có lượt trả giá.</p>
        </div>
      )}

      {!loading && !error && bids.length > 0 && (
        <div className="mt-8 overflow-x-auto border-y border-[var(--color-border)]">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="text-xs text-[var(--color-text-dim)]">
              <tr>
                <th className="py-4 pr-5 font-normal">Vật phẩm</th>
                <th className="py-4 pr-5 font-normal">Mã yêu cầu</th>
                <th className="py-4 pr-5 font-normal">Số tiền</th>
                <th className="py-4 pr-5 font-normal">Trạng thái</th>
                <th className="py-4 font-normal">Lý do</th>
              </tr>
            </thead>
            <tbody>
              {bids.map((bid) => (
                <tr key={bid.requestId} className="border-t border-[var(--color-border)]">
                  <td className="py-5 pr-5">
                    <Link to={`/auction-items/${encodeURIComponent(bid.itemId)}`} className="text-[var(--color-primary)]">
                      {bid.itemId}
                    </Link>
                  </td>
                  <td className="py-5 pr-5 font-mono text-xs">{bid.requestId}</td>
                  <td className="py-5 pr-5 font-display text-lg">{bid.amount}</td>
                  <td className="py-5 pr-5">{bid.status}</td>
                  <td className="py-5">{bid.reason || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && (cursorStack.length > 1 || nextCursor !== null) && (
        <nav aria-label="Phân trang" className="mt-9 flex justify-center gap-3">
          <button
            type="button"
            disabled={cursorStack.length === 1}
            onClick={() => {
              setLoading(true);
              setError(false);
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
                setLoading(true);
                setError(false);
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
