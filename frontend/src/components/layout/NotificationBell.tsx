import {
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { Bell, BellRing } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import useNotifications from '../../hooks/useNotifications';

import type {
    NotificationType,
    NotificationView,
} from '../../store/notificationStore';

type NotificationFilter = 'ALL' | 'UNREAD';

const notificationIcons: Record<NotificationType, string> = {
    BID: '↗',
    AUCTION: '⚖',
    SYSTEM: '●',
};

const formatNotificationTime = (createdAt: string) =>
    new Intl.DateTimeFormat('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(createdAt));

export default function NotificationBell() {
    const navigate = useNavigate();
    const containerRef = useRef<HTMLDivElement>(null);

    const { user } = useAuth();

    const {
        notifications,
        unreadCount,
        markAsRead,
        markAllAsRead,
    } = useNotifications(user);

    const [open, setOpen] = useState(false);
    const [filter, setFilter] =
        useState<NotificationFilter>('ALL');

    const visibleNotifications = useMemo(() => {
        const filtered =
            filter === 'UNREAD'
                ? notifications.filter(
                    (notification) => !notification.isRead,
                )
                : notifications;

        return filtered.slice(0, 6);
    }, [notifications, filter]);

    useEffect(() => {
        if (!open) return;

        const handleOutsideClick = (event: MouseEvent) => {
            if (
                containerRef.current &&
                !containerRef.current.contains(event.target as Node)
            ) {
                setOpen(false);
            }
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setOpen(false);
            }
        };

        document.addEventListener(
            'mousedown',
            handleOutsideClick,
        );

        document.addEventListener(
            'keydown',
            handleEscape,
        );

        return () => {
            document.removeEventListener(
                'mousedown',
                handleOutsideClick,
            );

            document.removeEventListener(
                'keydown',
                handleEscape,
            );
        };
    }, [open]);

    if (!user) return null;

    const handleNotificationClick = (
        notification: NotificationView,
    ) => {
        markAsRead(notification.id);
        setOpen(false);

        if (notification.actionUrl) {
            navigate(notification.actionUrl);
        }
    };

    return (
        <div ref={containerRef} className="relative">
            <button
                type="button"
                onClick={() => setOpen((current) => !current)}
                className="relative flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface-alt)] text-lg text-[var(--color-text)] transition hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                aria-label={`Thông báo, ${unreadCount} thông báo chưa đọc`}
                aria-expanded={open}
            >
                {unreadCount > 0 ? (
                    <BellRing
                        size={19}
                        strokeWidth={1.8}
                        aria-hidden="true"
                    />
                ) : (
                    <Bell
                        size={19}
                        strokeWidth={1.8}
                        aria-hidden="true"
                    />
                )}

                {unreadCount > 0 && (
                    <span className="absolute -right-1.5 -top-1.5 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[var(--color-danger-solid)] px-1 text-[10px] font-bold leading-none text-white">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {open && (
                <section className="absolute right-0 top-12 z-50 w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] shadow-2xl sm:w-96">
                    <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
                        <div>
                            <p className="text-lg font-semibold text-[var(--color-text)]">
                                Thông báo
                            </p>

                            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                                {unreadCount > 0
                                    ? `${unreadCount} thông báo chưa đọc`
                                    : 'Bạn đã đọc tất cả thông báo'}
                            </p>
                        </div>

                        {unreadCount > 0 && (
                            <button
                                type="button"
                                onClick={markAllAsRead}
                                className="text-xs font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]"
                            >
                                Đọc tất cả
                            </button>
                        )}
                    </div>

                    <div className="flex gap-2 px-5 py-3">
                        <button
                            type="button"
                            onClick={() => setFilter('ALL')}
                            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${filter === 'ALL'
                                ? 'bg-[var(--color-primary)] text-[var(--color-bg)]'
                                : 'bg-[var(--color-surface-alt)] text-[var(--color-text-soft)] hover:text-[var(--color-text)]'
                                }`}
                        >
                            Tất cả
                        </button>

                        <button
                            type="button"
                            onClick={() => setFilter('UNREAD')}
                            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${filter === 'UNREAD'
                                ? 'bg-[var(--color-primary)] text-[var(--color-bg)]'
                                : 'bg-[var(--color-surface-alt)] text-[var(--color-text-soft)] hover:text-[var(--color-text)]'
                                }`}
                        >
                            Chưa đọc
                        </button>
                    </div>

                    <div className="max-h-[420px] overflow-y-auto px-2 pb-2">
                        {visibleNotifications.length > 0 ? (
                            visibleNotifications.map((notification) => (
                                <button
                                    key={notification.id}
                                    type="button"
                                    onClick={() =>
                                        handleNotificationClick(notification)
                                    }
                                    className={`relative flex w-full gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-[var(--color-surface-raised)] ${notification.isRead
                                        ? ''
                                        : 'bg-[var(--color-primary)]/10'
                                        }`}
                                >
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface-alt)] text-base font-semibold text-[var(--color-primary)]">
                                        {notificationIcons[notification.type]}
                                    </span>

                                    <span className="min-w-0 flex-1">
                                        <span className="block pr-4 text-sm font-semibold text-[var(--color-text)]">
                                            {notification.title}
                                        </span>

                                        <span className="mt-1 block text-xs leading-5 text-[var(--color-text-soft)]">
                                            {notification.message}
                                        </span>

                                        <span className="mt-1.5 block text-[11px] text-[var(--color-primary)]">
                                            {formatNotificationTime(
                                                notification.createdAt,
                                            )}
                                        </span>
                                    </span>

                                    {!notification.isRead && (
                                        <span
                                            className="absolute right-3 top-4 h-2.5 w-2.5 rounded-full bg-[var(--color-primary)]"
                                            aria-label="Chưa đọc"
                                        />
                                    )}
                                </button>
                            ))
                        ) : (
                            <div className="px-6 py-10 text-center">
                                <p className="text-sm font-medium text-[var(--color-text)]">
                                    Không có thông báo
                                </p>

                                <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                                    {filter === 'UNREAD'
                                        ? 'Bạn đã đọc tất cả thông báo.'
                                        : 'Thông báo mới sẽ xuất hiện tại đây.'}
                                </p>
                            </div>
                        )}
                    </div>

                    <Link
                        to="/notifications"
                        onClick={() => setOpen(false)}
                        className="block border-t border-[var(--color-border)] px-5 py-3 text-center text-sm font-semibold text-[var(--color-primary)] transition hover:bg-[var(--color-surface-raised)]"
                    >
                        Xem tất cả thông báo
                    </Link>
                </section>
            )}
        </div>
    );
}