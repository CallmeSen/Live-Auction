import type { AuthUser, UserRole } from '../features/auth/types';

export type NotificationType =
  | 'BID'
  | 'AUCTION'
  | 'WALLET'
  | 'SYSTEM';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  createdAt: string;
  actionUrl?: string;
  recipientIds?: string[];
  recipientRoles?: UserRole[];
  initiallyRead?: boolean;
}

export interface NotificationView extends AppNotification {
  isRead: boolean;
}

const READ_IDS_KEY = 'demoNotificationReadIds';

export const NOTIFICATION_CHANGED_EVENT =
  'live-auction-notification-changed';

const mockNotifications: AppNotification[] = [
  {
    id: 'notification-01',
    type: 'BID',
    title: 'Bạn vừa bị vượt giá',
    message:
      'Một thành viên khác đã trả 19.000.000 đ cho Đồng hồ bỏ túi Thụy Sĩ 1920.',
    createdAt: '2026-07-13T14:20:00+07:00',
    actionUrl: '/auctions/1',
    recipientIds: ['user-demo-01'],
  },
  {
    id: 'notification-02',
    type: 'AUCTION',
    title: 'Phiên đấu giá sắp kết thúc',
    message:
      'Phiên Máy ảnh Rolleiflex Twin Lens sẽ kết thúc trong vòng 30 phút nữa.',
    createdAt: '2026-07-13T13:45:00+07:00',
    actionUrl: '/auctions/2',
    recipientIds: ['user-demo-01'],
  },
  {
    id: 'notification-03',
    type: 'WALLET',
    title: 'Nạp tiền thành công',
    message: '50.000.000 đ đã được cộng vào số dư ví của bạn.',
    createdAt: '2026-07-13T10:10:00+07:00',
    actionUrl: '/wallet',
    recipientIds: ['user-demo-01'],
    initiallyRead: true,
  },
  {
    id: 'notification-04',
    type: 'BID',
    title: 'Phiên của bạn có lượt trả giá mới',
    message:
      'Đồng hồ bỏ túi Thụy Sĩ 1920 vừa nhận được mức giá 19.000.000 đ.',
    createdAt: '2026-07-13T14:20:00+07:00',
    actionUrl: '/my-auctions',
    recipientIds: ['user-demo-02'],
  },
  {
    id: 'notification-05',
    type: 'AUCTION',
    title: 'Phiên đấu giá đã được duyệt',
    message:
      'Phiên Mâm đĩa than Audio Classic đã được quản trị viên phê duyệt.',
    createdAt: '2026-07-12T16:30:00+07:00',
    actionUrl: '/my-auctions',
    recipientIds: ['user-demo-02'],
  },
  {
    id: 'notification-06',
    type: 'AUCTION',
    title: 'Có phiên mới chờ kiểm duyệt',
    message:
      'Một thành viên vừa gửi phiên Bút máy bạc và sổ da thủ công để xét duyệt.',
    createdAt: '2026-07-13T11:25:00+07:00',
    actionUrl: '/admin/auctions',
    recipientIds: ['admin-demo-01'],
  },
  {
    id: 'notification-07',
    type: 'SYSTEM',
    title: 'Có thành viên mới đăng ký',
    message:
      'Một tài khoản thành viên mới vừa được tạo trên hệ thống.',
    createdAt: '2026-07-13T09:15:00+07:00',
    actionUrl: '/admin/users',
    recipientIds: ['admin-demo-01'],
  },
  {
    id: 'notification-08',
    type: 'SYSTEM',
    title: 'Chào mừng bạn đến với LiveAuction',
    message:
      'Theo dõi các phiên nổi bật hoặc đăng vật phẩm để tham gia đấu giá.',
    createdAt: '2026-07-11T08:00:00+07:00',
    actionUrl: '/auctions',
    recipientRoles: ['USER'],
    initiallyRead: true,
  },
  {
    id: 'notification-09',
    type: 'SYSTEM',
    title: 'Hệ thống đang sử dụng dữ liệu mẫu',
    message:
      'Các thông báo hiện tại được tạo bằng mock data và chưa kết nối backend.',
    createdAt: '2026-07-10T08:00:00+07:00',
    recipientRoles: ['USER', 'ADMIN'],
    initiallyRead: true,
  },
];

type ReadIdsByUser = Record<string, string[]>;

const getReadIdsByUser = (): ReadIdsByUser => {
  try {
    return JSON.parse(
      localStorage.getItem(READ_IDS_KEY) ?? '{}',
    ) as ReadIdsByUser;
  } catch {
    return {};
  }
};

const saveReadIdsByUser = (data: ReadIdsByUser) => {
  localStorage.setItem(READ_IDS_KEY, JSON.stringify(data));

  window.dispatchEvent(
    new Event(NOTIFICATION_CHANGED_EVENT),
  );
};

const belongsToUser = (
  notification: AppNotification,
  user: AuthUser,
) => {
  const matchesUser =
    notification.recipientIds?.includes(user.id) ?? false;

  const matchesRole =
    notification.recipientRoles?.includes(user.role) ?? false;

  return matchesUser || matchesRole;
};

export const getNotificationsForUser = (
  user: AuthUser,
): NotificationView[] => {
  const readIds = getReadIdsByUser()[user.id] ?? [];

  return mockNotifications
    .filter((notification) =>
      belongsToUser(notification, user),
    )
    .map((notification) => ({
      ...notification,
      isRead:
        notification.initiallyRead === true ||
        readIds.includes(notification.id),
    }))
    .sort(
      (first, second) =>
        new Date(second.createdAt).getTime() -
        new Date(first.createdAt).getTime(),
    );
};

export const markNotificationAsRead = (
  userId: string,
  notificationId: string,
) => {
  const readIdsByUser = getReadIdsByUser();
  const currentReadIds = readIdsByUser[userId] ?? [];

  if (currentReadIds.includes(notificationId)) return;

  saveReadIdsByUser({
    ...readIdsByUser,
    [userId]: [...currentReadIds, notificationId],
  });
};

export const markAllNotificationsAsRead = (
  userId: string,
  notificationIds: string[],
) => {
  const readIdsByUser = getReadIdsByUser();
  const currentReadIds = readIdsByUser[userId] ?? [];

  saveReadIdsByUser({
    ...readIdsByUser,
    [userId]: Array.from(
      new Set([...currentReadIds, ...notificationIds]),
    ),
  });
};