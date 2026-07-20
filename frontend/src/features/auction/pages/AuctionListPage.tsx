<<<<<<< HEAD
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import AuctionCard from '../../../components/auction/AuctionCard';
import AuctionFilter from '../../../components/auction/AuctionFilter';
import { getPublicDemoAuctions } from '../../../store/auctionStore';
import { formatCurrency } from '../../../utils/formatCurrency';
import { getTimeLeft } from '../../../utils/formatDate';
import type { AuctionStatus } from '../types';
import useAuth from '../../../hooks/useAuth';

const PAGE_SIZE = 4;
=======
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { auctionItemApi } from '../../../api/auctionItemApi';
import AuctionCard from '../../../components/auction/AuctionCard';
import AuctionFilter from '../../../components/auction/AuctionFilter';
import { formatCurrency } from '../../../utils/formatCurrency';
import { getTimeLeft } from '../../../utils/formatDate';
import type { Auction, AuctionStatus } from '../types';
import useAuth from '../../../hooks/useAuth';
import {
  AuctionItemSortBy,
  SortOrder,
  type AuctionItemListItem,
  type ListAuctionItemsParams,
} from '../../../types/itemTypes';
import { AuctionItemStatus, AuctionSessionStatus } from '../../../type/type';

const PAGE_SIZE = 12;
const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1560393464-5c69a73c5770?auto=format&fit=crop&q=85&w=1200';

const parseMoney = (value: string) => Number(value);

const mapItemStatusToFilter = (
  status: AuctionStatus | 'ALL',
): AuctionItemStatus | undefined => {
  if (status === 'ALL') return undefined;
  if (status === 'ACTIVE') return AuctionItemStatus.OPEN;
  if (status === 'UPCOMING') return AuctionItemStatus.UNSOLD;
  if (status === 'ENDED') return AuctionItemStatus.SOLD;
  if (status === 'CANCELLED') return AuctionItemStatus.CANCELLED;
  return undefined;
};

const resolveDisplayStatus = (item: AuctionItemListItem): AuctionStatus => {
  if (item.status === AuctionItemStatus.CANCELLED) return 'CANCELLED';
  if (item.status === AuctionItemStatus.SOLD) return 'ENDED';
  if (
    item.session.status === AuctionSessionStatus.ACTIVE &&
    item.status === AuctionItemStatus.OPEN
  ) {
    return 'ACTIVE';
  }
  if (item.session.status === AuctionSessionStatus.ENDED) return 'ENDED';
  if (item.session.status === AuctionSessionStatus.CANCELLED) return 'CANCELLED';
  return 'UPCOMING';
};

const mapListItemToAuction = (item: AuctionItemListItem): Auction => ({
  id: item.id,
  title: item.title,
  category: item.category?.name ?? 'Khác',
  categoryId: item.category?.id ?? '',
  image: item.primaryImageUrl ?? FALLBACK_IMAGE,
  currentPrice: parseMoney(item.currentPrice),
  startingPrice: parseMoney(item.startingPrice),
  minimumBidIncrement: parseMoney(item.session.minIncrement),
  bidCount: item.bidCount,
  startTime: item.session.startTime,
  endTime: item.session.endTime,
  createdAt: item.createdAt,
  status: resolveDisplayStatus(item),
  approvalStatus: 'APPROVED',
  seller: item.seller.fullName,
  sellerEmail: '',
  location: '',
  condition: '',
  description: item.description ?? '',
  finalPrice: item.finalPrice ? parseMoney(item.finalPrice) : undefined,
});

const mapSortToQuery = (
  sort: string,
): Pick<ListAuctionItemsParams, 'sortBy' | 'sortOrder'> => {
  if (sort === 'price-asc') {
    return {
      sortBy: AuctionItemSortBy.CURRENT_PRICE,
      sortOrder: SortOrder.ASC,
    };
  }
  if (sort === 'price-desc') {
    return {
      sortBy: AuctionItemSortBy.CURRENT_PRICE,
      sortOrder: SortOrder.DESC,
    };
  }
  if (sort === 'newest') {
    return {
      sortBy: AuctionItemSortBy.CREATED_AT,
      sortOrder: SortOrder.DESC,
    };
  }
  return {
    sortBy: AuctionItemSortBy.CLOSED_AT,
    sortOrder: SortOrder.ASC,
  };
};

type CategoryOption = {
  id: string;
  name: string;
};
>>>>>>> 3d6cdde (temp: preserve auction frontend and backend changes)

export default function AuctionListPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Tất cả');
  const [status, setStatus] = useState<AuctionStatus | 'ALL'>('ALL');
  const [sort, setSort] = useState('end-asc');
<<<<<<< HEAD
  const [page, setPage] = useState(0);
  const auctions = getPublicDemoAuctions();
  const featured = auctions.find((auction) => auction.featured) ?? auctions[0];
  const categories = [...new Set(auctions.map((auction) => auction.category))];

  const filteredAuctions = useMemo(() => {
    const result = auctions.filter((auction) => {
      const matchesSearch = auction.title.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = category === 'Tất cả' || auction.category === category;
      const matchesStatus = status === 'ALL' || auction.status === status;
      return matchesSearch && matchesCategory && matchesStatus;
    });
    return result.sort((a, b) => {
      if (sort === 'price-asc') return a.currentPrice - b.currentPrice;
      if (sort === 'price-desc') return b.currentPrice - a.currentPrice;
      if (sort === 'newest') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return new Date(a.endTime).getTime() - new Date(b.endTime).getTime();
    });
  }, [auctions, search, category, status, sort]);

  const totalPages = Math.max(1, Math.ceil(filteredAuctions.length / PAGE_SIZE));
  const visibleAuctions = filteredAuctions.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const updateFilter = (callback: () => void) => { callback(); setPage(0); };
=======
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<AuctionItemListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const selectedCategoryId = useMemo(() => {
    if (category === 'Tất cả') return undefined;
    return categories.find((item) => item.name === category)?.id;
  }, [category, categories]);

  useEffect(() => {
    let cancelled = false;

    const fetchItems = async () => {
      setLoading(true);
      setError('');

      try {
        const sortQuery = mapSortToQuery(sort);
        const response = await auctionItemApi.list({
          page,
          pageSize: PAGE_SIZE,
          keyword: search.trim() || undefined,
          status: mapItemStatusToFilter(status),
          categoryId: selectedCategoryId,
          ...sortQuery,
        });

        if (cancelled) return;

        const data = response.data.data;
        setItems(data.items);
        setTotal(data.total);
        setTotalPages(data.totalPages);

        setCategories((previous) => {
          const merged = new Map(previous.map((item) => [item.id, item]));

          data.items.forEach((item) => {
            if (item.category) {
              merged.set(item.category.id, {
                id: item.category.id,
                name: item.category.name,
              });
            }
          });

          return [...merged.values()].sort((a, b) =>
            a.name.localeCompare(b.name, 'vi'),
          );
        });
      } catch (fetchError) {
        if (cancelled) return;

        if (axios.isAxiosError(fetchError) && !fetchError.response) {
          setError('Không thể kết nối tới máy chủ. Vui lòng thử lại sau.');
        } else {
          setError('Không thể tải danh sách vật phẩm. Vui lòng thử lại sau.');
        }

        setItems([]);
        setTotal(0);
        setTotalPages(0);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchItems();

    return () => {
      cancelled = true;
    };
  }, [page, search, status, sort, selectedCategoryId, reloadKey]);

  const auctions = useMemo(
    () => items.map(mapListItemToAuction),
    [items],
  );

  const featured = auctions[0];
  const activeCount = auctions.filter((auction) => auction.status === 'ACTIVE').length;
  const categoryNames = categories.map((item) => item.name);

  const updateFilter = (callback: () => void) => {
    callback();
    setPage(1);
  };

  const resetFilters = () => {
    setSearch('');
    setCategory('Tất cả');
    setStatus('ALL');
    setPage(1);
  };
>>>>>>> 3d6cdde (temp: preserve auction frontend and backend changes)

  return (
    <div>
      <section className="relative overflow-hidden border-b border-[var(--color-border)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(201,162,39,0.12),transparent_32%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-10 px-6 py-12 lg:grid-cols-[1fr_1.08fr] lg:items-center lg:py-18">
          <div>
<<<<<<< HEAD
            <div className="flex items-center gap-3"><span className="h-px w-8 bg-[var(--color-primary)]" /><span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[var(--color-primary)]">Đấu giá chọn lọc mỗi ngày</span></div>
            <h1 className="mt-5 max-w-xl font-display text-5xl leading-[1.08] text-[var(--color-text)] sm:text-6xl">Tìm thấy giá trị trong từng món đồ.</h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-[var(--color-text-soft)]">Tìm kiếm, lọc trạng thái và theo dõi các phiên đấu giá bằng dữ liệu demo trước khi kết nối backend.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#auction-list" className="rounded-md bg-[var(--color-primary)] px-5 py-3 text-sm font-semibold text-[var(--color-bg)] hover:bg-[var(--color-primary-hover)]">Khám phá phiên đấu giá</a>
              {user?.role === 'USER' && <Link to="/auctions/create" className="rounded-md border border-[var(--color-border-strong)] px-5 py-3 text-sm font-semibold text-[var(--color-text)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]">Đăng vật phẩm</Link>}
              {!user && <Link to="/login" className="rounded-md border border-[var(--color-border-strong)] px-5 py-3 text-sm font-semibold text-[var(--color-text)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]">Đăng nhập để tham gia</Link>}
            </div>
            <dl className="mt-10 grid max-w-md grid-cols-3 gap-5 border-t border-[var(--color-border)] pt-6">
              {[[auctions.length, 'Phiên công khai'], [auctions.filter((item) => item.status === 'ACTIVE').length, 'Đang diễn ra'], [2, 'Loại tài khoản']].map(([value, label]) => <div key={label}><dt className="font-display text-2xl text-[var(--color-text)]">{value}</dt><dd className="mt-1 text-[11px] text-[var(--color-text-muted)]">{label}</dd></div>)}
            </dl>
          </div>

          <Link to={`/auctions/${featured.id}`} className="group relative block overflow-hidden rounded-[1.5rem] border border-[var(--color-border-strong)] bg-[var(--color-surface-alt)]">
            <img src={featured.image} alt={featured.title} className="aspect-[16/10] w-full object-cover transition duration-700 group-hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-bg-deep)] via-[var(--color-bg-deep)]/20 to-transparent" />
            <span className="absolute left-5 top-5 rounded-full border border-[#ff765f]/50 bg-[#811f11]/60 px-3 py-1.5 font-mono-tag text-[10px] uppercase tracking-[0.18em] text-[#ffb2a5] backdrop-blur"><span className="mr-2 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#ff765f]" />Lot nổi bật</span>
            <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8"><p className="font-mono-tag text-xs uppercase tracking-[0.18em] text-[#d8c579]">Kết thúc sau {getTimeLeft(featured.endTime)}</p><h2 className="mt-2 font-display text-3xl text-white sm:text-4xl">{featured.title}</h2><div className="mt-4 flex items-end justify-between"><div><p className="text-xs text-[var(--color-text-muted)]">Giá hiện tại</p><p className="mt-1 font-display text-2xl text-[var(--color-primary-hover)]">{formatCurrency(featured.currentPrice)}</p></div><span className="flex h-11 w-11 items-center justify-center rounded-full border border-white/30 text-lg text-white group-hover:bg-[var(--color-primary)] group-hover:text-[var(--color-bg)]">↗</span></div></div>
          </Link>
=======
            <div className="flex items-center gap-3">
              <span className="h-px w-8 bg-[var(--color-primary)]" />
              <span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[var(--color-primary)]">
                Đấu giá chọn lọc mỗi ngày
              </span>
            </div>
            <h1 className="mt-5 max-w-xl font-display text-5xl leading-[1.08] text-[var(--color-text)] sm:text-6xl">
              Tìm thấy giá trị trong từng món đồ.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-[var(--color-text-soft)]">
              Tìm kiếm, lọc trạng thái và theo dõi các vật phẩm đấu giá từ hệ thống backend.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#auction-list"
                className="rounded-md bg-[var(--color-primary)] px-5 py-3 text-sm font-semibold text-[var(--color-bg)] hover:bg-[var(--color-primary-hover)]"
              >
                Khám phá vật phẩm
              </a>
              {user?.role === 'USER' && (
                <Link
                  to="/auction-items/create"
                  className="rounded-md border border-[var(--color-border-strong)] px-5 py-3 text-sm font-semibold text-[var(--color-text)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                >
                  Đăng vật phẩm
                </Link>
              )}
              {!user && (
                <Link
                  to="/login"
                  className="rounded-md border border-[var(--color-border-strong)] px-5 py-3 text-sm font-semibold text-[var(--color-text)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                >
                  Đăng nhập để tham gia
                </Link>
              )}
            </div>
            <dl className="mt-10 grid max-w-md grid-cols-3 gap-5 border-t border-[var(--color-border)] pt-6">
              {[
                [total, 'Vật phẩm'],
                [activeCount, 'Đang mở'],
                [categoryNames.length, 'Danh mục'],
              ].map(([value, label]) => (
                <div key={label}>
                  <dt className="font-display text-2xl text-[var(--color-text)]">{value}</dt>
                  <dd className="mt-1 text-[11px] text-[var(--color-text-muted)]">{label}</dd>
                </div>
              ))}
            </dl>
          </div>

          {featured && (
            <Link
              to={`/auction-items/${featured.id}`}
              className="group relative block overflow-hidden rounded-[1.5rem] border border-[var(--color-border-strong)] bg-[var(--color-surface-alt)]"
            >
              <img
                src={featured.image}
                alt={featured.title}
                className="aspect-[16/10] w-full object-cover transition duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-bg-deep)] via-[var(--color-bg-deep)]/20 to-transparent" />
              <span className="absolute left-5 top-5 rounded-full border border-[#ff765f]/50 bg-[#811f11]/60 px-3 py-1.5 font-mono-tag text-[10px] uppercase tracking-[0.18em] text-[#ffb2a5] backdrop-blur">
                <span className="mr-2 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#ff765f]" />
                Lot nổi bật
              </span>
              <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
                <p className="font-mono-tag text-xs uppercase tracking-[0.18em] text-[#d8c579]">
                  Kết thúc sau {getTimeLeft(featured.endTime)}
                </p>
                <h2 className="mt-2 font-display text-3xl text-white sm:text-4xl">
                  {featured.title}
                </h2>
                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <p className="text-xs text-[var(--color-text-muted)]">Giá hiện tại</p>
                    <p className="mt-1 font-display text-2xl text-[var(--color-primary-hover)]">
                      {formatCurrency(featured.currentPrice)}
                    </p>
                  </div>
                  <span className="flex h-11 w-11 items-center justify-center rounded-full border border-white/30 text-lg text-white group-hover:bg-[var(--color-primary)] group-hover:text-[var(--color-bg)]">
                    ↗
                  </span>
                </div>
              </div>
            </Link>
          )}
>>>>>>> 3d6cdde (temp: preserve auction frontend and backend changes)
        </div>
      </section>

      <section id="auction-list" className="mx-auto max-w-7xl px-6 py-14 sm:py-18">
<<<<<<< HEAD
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[var(--color-primary)]">Danh sách phiên</span><h2 className="mt-2 font-display text-3xl text-[var(--color-text)] sm:text-4xl">Tất cả vật phẩm</h2></div><p className="max-w-md text-sm leading-6 text-[var(--color-text-muted)]">Hiển thị {filteredAuctions.length} kết quả · trang {page + 1}/{totalPages}</p></div>
        <div className="mt-8"><AuctionFilter search={search} category={category} status={status} sort={sort} categories={categories} onSearchChange={(value) => updateFilter(() => setSearch(value))} onCategoryChange={(value) => updateFilter(() => setCategory(value))} onStatusChange={(value) => updateFilter(() => setStatus(value))} onSortChange={(value) => updateFilter(() => setSort(value))} /></div>

        {visibleAuctions.length ? <div className="mt-8 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">{visibleAuctions.map((auction) => <AuctionCard key={auction.id} auction={auction} />)}</div> : <div className="mt-8 rounded-xl border border-dashed border-[var(--color-border-strong)] py-16 text-center"><p className="font-display text-xl">Không tìm thấy phiên đấu giá</p><button onClick={() => { setSearch(''); setCategory('Tất cả'); setStatus('ALL'); setPage(0); }} className="mt-3 text-sm text-[var(--color-primary)]">Xóa bộ lọc</button></div>}

        {totalPages > 1 && <div className="mt-9 flex items-center justify-center gap-2"><button disabled={page === 0} onClick={() => setPage((value) => value - 1)} className="rounded-md border border-[var(--color-border-strong)] px-4 py-2 text-xs disabled:opacity-40">← Trước</button>{Array.from({ length: totalPages }, (_, index) => <button key={index} onClick={() => setPage(index)} className={`h-9 w-9 rounded-md text-xs ${page === index ? 'bg-[var(--color-primary)] text-[var(--color-bg)]' : 'border border-[var(--color-border-strong)] text-[var(--color-text-muted)]'}`}>{index + 1}</button>)}<button disabled={page >= totalPages - 1} onClick={() => setPage((value) => value + 1)} className="rounded-md border border-[var(--color-border-strong)] px-4 py-2 text-xs disabled:opacity-40">Sau →</button></div>}
=======
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[var(--color-primary)]">
              Danh sách vật phẩm
            </span>
            <h2 className="mt-2 font-display text-3xl text-[var(--color-text)] sm:text-4xl">
              Tất cả vật phẩm
            </h2>
          </div>
          <p className="max-w-md text-sm leading-6 text-[var(--color-text-muted)]">
            Hiển thị {total} kết quả · trang {page}/{Math.max(totalPages, 1)}
          </p>
        </div>

        <div className="mt-8">
          <AuctionFilter
            search={search}
            category={category}
            status={status}
            sort={sort}
            categories={categoryNames}
            onSearchChange={(value) => updateFilter(() => setSearch(value))}
            onCategoryChange={(value) => updateFilter(() => setCategory(value))}
            onStatusChange={(value) => updateFilter(() => setStatus(value))}
            onSortChange={(value) => updateFilter(() => setSort(value))}
          />
        </div>

        {loading && (
          <div className="mt-8 rounded-xl border border-[var(--color-border)] py-16 text-center text-sm text-[var(--color-text-muted)]">
            Đang tải danh sách vật phẩm...
          </div>
        )}

        {!loading && error && (
          <div className="mt-8 rounded-xl border border-[var(--color-danger-border)] bg-[var(--color-danger-solid)]/10 py-16 text-center">
            <p className="font-display text-xl text-[var(--color-danger)]">{error}</p>
            <button
              onClick={() => setReloadKey((value) => value + 1)}
              className="mt-3 text-sm text-[var(--color-primary)]"
            >
              Thử lại
            </button>
          </div>
        )}

        {!loading && !error && auctions.length > 0 && (
          <div className="mt-8 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {auctions.map((auction) => (
              <AuctionCard key={auction.id} auction={auction} />
            ))}
          </div>
        )}

        {!loading && !error && auctions.length === 0 && (
          <div className="mt-8 rounded-xl border border-dashed border-[var(--color-border-strong)] py-16 text-center">
            <p className="font-display text-xl">Không tìm thấy vật phẩm</p>
            <button
              onClick={resetFilters}
              className="mt-3 text-sm text-[var(--color-primary)]"
            >
              Xóa bộ lọc
            </button>
          </div>
        )}

        {!loading && !error && totalPages > 1 && (
          <div className="mt-9 flex items-center justify-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((value) => value - 1)}
              className="rounded-md border border-[var(--color-border-strong)] px-4 py-2 text-xs disabled:opacity-40"
            >
              ← Trước
            </button>
            {Array.from({ length: totalPages }, (_, index) => (
              <button
                key={index}
                onClick={() => setPage(index + 1)}
                className={`h-9 w-9 rounded-md text-xs ${
                  page === index + 1
                    ? 'bg-[var(--color-primary)] text-[var(--color-bg)]'
                    : 'border border-[var(--color-border-strong)] text-[var(--color-text-muted)]'
                }`}
              >
                {index + 1}
              </button>
            ))}
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((value) => value + 1)}
              className="rounded-md border border-[var(--color-border-strong)] px-4 py-2 text-xs disabled:opacity-40"
            >
              Sau →
            </button>
          </div>
        )}
>>>>>>> 3d6cdde (temp: preserve auction frontend and backend changes)
      </section>
    </div>
  );
}
