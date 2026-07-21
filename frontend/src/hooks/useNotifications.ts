import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import type { AuthUser } from '../features/auth/types';

import {
  getNotificationsForUser,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  NOTIFICATION_CHANGED_EVENT,
  type NotificationView,
} from '../store/notificationStore';

export default function useNotifications(
  user: AuthUser | null,
) {
  const [notifications, setNotifications] = useState<
    NotificationView[]
  >([]);

  const refreshNotifications = useCallback(() => {
    if (!user) {
      setNotifications([]);
      return;
    }

    setNotifications(getNotificationsForUser(user));
  }, [user]);

  useEffect(() => {
    const refreshFrame = window.requestAnimationFrame(
      refreshNotifications,
    );

    window.addEventListener(
      NOTIFICATION_CHANGED_EVENT,
      refreshNotifications,
    );

    window.addEventListener(
      'storage',
      refreshNotifications,
    );

    return () => {
      window.cancelAnimationFrame(refreshFrame);

      window.removeEventListener(
        NOTIFICATION_CHANGED_EVENT,
        refreshNotifications,
      );

      window.removeEventListener(
        'storage',
        refreshNotifications,
      );
    };
  }, [refreshNotifications]);

  const unreadCount = useMemo(
    () =>
      notifications.filter(
        (notification) => !notification.isRead,
      ).length,
    [notifications],
  );

  const markAsRead = useCallback(
    (notificationId: string) => {
      if (!user) return;

      markNotificationAsRead(user.id, notificationId);
      refreshNotifications();
    },
    [user, refreshNotifications],
  );

  const markAllAsRead = useCallback(() => {
    if (!user) return;

    markAllNotificationsAsRead(
      user.id,
      notifications.map(
        (notification) => notification.id,
      ),
    );

    refreshNotifications();
  }, [user, notifications, refreshNotifications]);

  return {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    refreshNotifications,
  };
}