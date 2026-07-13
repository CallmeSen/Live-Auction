import type { AuctionStatus } from '../../features/auction/types';

interface AuctionFilterProps {
  search: string;
  category: string;
  status: AuctionStatus | 'ALL';
  sort: string;
  categories: string[];
  onSearchChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onStatusChange: (value: AuctionStatus | 'ALL') => void;
  onSortChange: (value: string) => void;
}

const statusOptions: Array<{ value: AuctionStatus | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'UPCOMING', label: 'Sắp diễn ra' },
  { value: 'ACTIVE', label: 'Đang diễn ra' },
  { value: 'ENDED', label: 'Đã kết thúc' },
];

export default function AuctionFilter(props: AuctionFilterProps) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex gap-2 overflow-x-auto pb-3">
        {statusOptions.map((item) => (
          <button key={item.value} onClick={() => props.onStatusChange(item.value)} className={`whitespace-nowrap rounded-full border px-4 py-2 text-xs transition ${props.status === item.value ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-bg)]' : 'border-[var(--color-border-strong)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]'}`}>{item.label}</button>
        ))}
      </div>
      <div className="grid gap-3 border-t border-[var(--color-border)] pt-4 md:grid-cols-[1fr_190px_190px]">
        <label className="relative block">
          <span className="sr-only">Tìm phiên đấu giá</span><span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]">⌕</span>
          <input value={props.search} onChange={(event) => props.onSearchChange(event.target.value)} placeholder="Tìm theo tên vật phẩm..." className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] py-3 pl-11 pr-4 text-sm text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-dim)] focus:border-[var(--color-primary)]" />
        </label>
        <select value={props.category} onChange={(event) => props.onCategoryChange(event.target.value)} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]">
          <option value="Tất cả">Tất cả danh mục</option>{props.categories.map((item) => <option key={item}>{item}</option>)}
        </select>
        <select value={props.sort} onChange={(event) => props.onSortChange(event.target.value)} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]">
          <option value="end-asc">Kết thúc sớm nhất</option><option value="price-asc">Giá thấp đến cao</option><option value="price-desc">Giá cao đến thấp</option><option value="newest">Mới đăng</option>
        </select>
      </div>
    </div>
  );
}
