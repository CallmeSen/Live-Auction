import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
    auctionService,
} from '../../../services/auctionService';
import type {
    AuctionSessionDetailResponse,
} from '../../../services/auctionService.types';
import { getApiErrorMessage } from '../../../services/apiError';
import { formatCurrency } from '../../../utils/formatCurrency';
import { formatDateTime } from '../../../utils/formatDate';

export default function AuctionSessionDetailPage() {
    const { id } = useParams();
    const [session, setSession] =
        useState<AuctionSessionDetailResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;

        const loadSession = async () => {
            if (!id) {
                setError('Không tìm thấy mã phiên đấu giá.');
                setLoading(false);
                return;
            }

            try {
                const data =
                    await auctionService.getSessionById(id);

                if (!cancelled) {
                    setSession(data);
                }
            } catch (loadError) {
                if (!cancelled) {
                    setError(
                        getApiErrorMessage(
                            loadError,
                            'Không thể tải chi tiết phiên đấu giá.',
                        ),
                    );
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        void loadSession();

        return () => {
            cancelled = true;
        };
    }, [id]);

    if (loading) {
        return (
            <div className="mx-auto max-w-6xl px-6 py-16 text-sm text-[var(--color-text-muted)]">
                Đang tải chi tiết phiên đấu giá...
            </div>
        );
    }

    if (error || !session) {
        return (
            <div className="mx-auto max-w-6xl px-6 py-16">
                <p className="rounded-xl border border-[var(--color-danger-border)] p-5 text-sm text-[var(--color-danger)]">
                    {error || 'Không tìm thấy phiên đấu giá.'}
                </p>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-6xl px-6 py-10 sm:py-14">
            <span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[var(--color-primary)]">
                Chi tiết phiên
            </span>

            <div className="mt-3 flex flex-wrap items-center gap-3">
                <h1 className="font-display text-4xl">
                    {session.title}
                </h1>

                <span className="rounded-full border border-[var(--color-border-strong)] px-3 py-1 text-xs text-[var(--color-primary)]">
                    {session.status}
                </span>
            </div>

            <p className="mt-3 text-sm leading-6 text-[var(--color-text-muted)]">
                {session.description || 'Phiên chưa có mô tả.'}
            </p>

            <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                    <p className="text-xs text-[var(--color-text-dim)]">
                        Người tạo
                    </p>
                    <p className="mt-2 text-sm">
                        {session.seller.fullName}
                    </p>
                </div>

                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                    <p className="text-xs text-[var(--color-text-dim)]">
                        Bắt đầu
                    </p>
                    <p className="mt-2 text-sm">
                        {formatDateTime(session.startTime)}
                    </p>
                </div>

                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                    <p className="text-xs text-[var(--color-text-dim)]">
                        Kết thúc
                    </p>
                    <p className="mt-2 text-sm">
                        {formatDateTime(session.endTime)}
                    </p>
                </div>

                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                    <p className="text-xs text-[var(--color-text-dim)]">
                        Bước giá tối thiểu
                    </p>
                    <p className="mt-2 text-sm text-[var(--color-primary)]">
                        {formatCurrency(Number(session.rule.minIncrement))}
                    </p>
                </div>
            </div>

            <div className="mt-10 flex items-center justify-between">
                <h2 className="font-display text-2xl">
                    Vật phẩm trong phiên
                </h2>

                <span className="text-xs text-[var(--color-text-muted)]">
                    {session.items.length} vật phẩm
                </span>
            </div>

            {session.items.length === 0 ? (
                <div className="mt-5 rounded-xl border border-dashed border-[var(--color-border-strong)] py-14 text-center">
                    <p className="text-sm text-[var(--color-text-muted)]">
                        Phiên chưa có vật phẩm nào
                    </p>
                </div>
            ) : (
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                    {session.items.map((item) => (
                        <article
                            key={item.id}
                            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
                        >
                            <div className="flex items-start gap-4">
                                {item.primaryImageUrl ? (
                                    <img
                                        src={item.primaryImageUrl}
                                        alt={item.title}
                                        className="h-20 w-24 rounded-lg object-cover"
                                    />
                                ) : (
                                    <div className="flex h-20 w-24 items-center justify-center rounded-lg bg-[var(--color-surface-alt)] text-xs text-[var(--color-text-dim)]">
                                        Chưa có ảnh
                                    </div>
                                )}

                                <div className="min-w-0 flex-1">
                                    <span className="text-[10px] text-[var(--color-primary)]">
                                        {item.status}
                                    </span>

                                    <h3 className="mt-1 font-display text-lg">
                                        {item.title}
                                    </h3>

                                    <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                                        Hiện tại:{' '}
                                        <strong className="text-[var(--color-primary)]">
                                            {formatCurrency(Number(item.currentPrice))}
                                        </strong>
                                    </p>
                                </div>
                            </div>

                            <Link
                                to={`/auction-items/${item.id}`}
                                className="mt-4 inline-block text-sm text-[var(--color-primary)]"
                            >
                                Xem vật phẩm →
                            </Link>
                        </article>
                    ))}
                </div>
            )}
        </div>
    );
}