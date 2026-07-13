import { useMemo, useState } from 'react';

import {
  Bell,
  Gavel,
  Info,
  Wallet,
} from 'lucide-react';

import { useNavigate } from 'react-router-dom';

import useAuth from '../../../hooks/useAuth';
import useNotifications from '../../../hooks/useNotifications';

import type {
  NotificationType,
  NotificationView,
} from '../../../store/notificationStore';

type NotificationFilter = 'ALL' | 'UNREAD';

const formatNotificationDate = (createdAt: string) =>
  new Intl.DateTimeFormat('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(createdAt));

const getNotificationIcon = (
  type: NotificationType,
) => {
  switch (type) {
    case 'BID':
      return <Gavel size={21} strokeWidth={1.8} />;

    case 'WALLET':
      return <Wallet size={21} strokeWidth={1.8} />;

    case 'AUCTION':
      return <Bell size={21} strokeWidth={1.8} />;

    default:
      return <Info size={21} strokeWidth={1.8} />;
  }
};

export default function NotificationsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
  } = useNotifications(user);

  const [filter, setFilter] =
    useState<NotificationFilter>('ALL');

  const visibleNotifications = useMemo(
    () =>
      filter === 'UNREAD'
        ? notifications.filter(
            (notification) => !notification.isRead,
          )
        : notifications,
    [filter, notifications],
  );

  const handleNotificationClick = (
    notification: NotificationView,
  ) => {
    markAsRead(notification.id);

    if (notification.actionUrl) {
      navigate(notification.actionUrl);
    }
  };

  return (
    <main className="min-h-[calc(100vh-72px)] bg-[var(--color-bg)] px-6 py-10">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-col gap-5 border-b border-[var(--color-border)] pb-7 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--color-primary)]">
              Trung tâm thông báo
            </p>

            <h1 className="mt-3 text-3xl font-semibold text-[var(--color-text)] sm:text-4xl">
              Thông báo của bạn
            </h1>

            <p className="mt-2 text-sm leading-6 text-[var(--color-text-soft)]">
              Theo dõi lượt trả giá, phiên đấu giá, ví và
              những cập nhật mới nhất.
            </p>
          </div>

          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllAsRead}
              className="self-start rounded-md border border-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-[var(--color-primary)] transition hover:bg-[var(--color-primary)]/10 sm:self-auto"
            >
              Đánh dấu tất cả đã đọc
            </button>
          )}
        </div>

        <div className="mt-7 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setFilter('ALL')}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
                filter === 'ALL'
                  ? 'bg-[var(--color-primary)] text-[var(--color-bg)]'
                  : 'border border-[var(--color-border-strong)] bg-[var(--color-surface)] text-[var(--color-text-soft)] hover:text-[var(--color-text)]'
              }`}
            >
              Tất cả
              <span className="ml-2 opacity-70">
                {notifications.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setFilter('UNREAD')}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
                filter === 'UNREAD'
                  ? 'bg-[var(--color-primary)] text-[var(--color-bg)]'
                  : 'border border-[var(--color-border-strong)] bg-[var(--color-surface)] text-[var(--color-text-soft)] hover:text-[var(--color-text)]'
              }`}
            >
              Chưa đọc
              <span className="ml-2 opacity-70">
                {unreadCount}
              </span>
            </button>
          </div>

          <p className="text-xs text-[var(--color-text-muted)]">
            Mới nhất được hiển thị trước
          </p>
        </div>

        <section className="mt-6 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
          {visibleNotifications.length > 0 ? (
            visibleNotifications.map(
              (notification, index) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() =>
                    handleNotificationClick(notification)
                  }
                  className={`relative flex w-full gap-4 px-5 py-5 text-left transition hover:bg-[var(--color-surface-raised)] sm:px-7 ${
                    index !==
                    visibleNotifications.length - 1
                      ? 'border-b border-[var(--color-border)]'
                      : ''
                  } ${
                    notification.isRead
                      ? ''
                      : 'bg-[var(--color-primary)]/10'
                  }`}
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface-alt)] text-[var(--color-primary)]">
                    {getNotificationIcon(
                      notification.type,
                    )}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-4">
                      <span className="text-base font-semibold text-[var(--color-text)]">
                        {notification.title}
                      </span>

                      {!notification.isRead && (
                        <span
                          className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--color-primary)]"
                          aria-label="Chưa đọc"
                        />
                      )}
                    </span>

                    <span className="mt-1.5 block text-sm leading-6 text-[var(--color-text-soft)]">
                      {notification.message}
                    </span>

                    <span className="mt-2 block text-xs capitalize text-[var(--color-primary)]">
                      {formatNotificationDate(
                        notification.createdAt,
                      )}
                    </span>
                  </span>
                </button>
              ),
            )
          ) : (
            <div className="px-6 py-20 text-center">
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface-alt)] text-[var(--color-primary)]">
                <Bell size={27} strokeWidth={1.6} />
              </span>

              <h2 className="mt-5 text-xl font-semibold text-[var(--color-text)]">
                Không có thông báo
              </h2>

              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--color-text-muted)]">
                {filter === 'UNREAD'
                  ? 'Bạn đã đọc tất cả thông báo hiện có.'
                  : 'Khi có cập nhật mới, thông báo sẽ xuất hiện tại đây.'}
              </p>
            </div>
          )}
        </section>

        <p className="mt-5 text-center text-xs text-[var(--color-text-dim)]">
          Hiện tại đây là dữ liệu mẫu lưu trên trình duyệt.
          Sau này dữ liệu sẽ được lấy từ backend.
        </p>
      </div>
    </main>
  );
}