import type { UserRole } from '../features/auth/types';

export interface AdminUserRecord {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  status: 'ACTIVE' | 'INACTIVE';
  joinedAt: string;
  auctions: number;
  bids: number;
}

export const mockUsers: AdminUserRecord[] = [
  { id: 'u-01', fullName: 'Nguyễn Minh User', email: 'user1@gmail.com', role: 'USER', status: 'ACTIVE', joinedAt: '2026-07-01T09:00:00+07:00', auctions: 1, bids: 12 },
  { id: 'u-02', fullName: 'Trần Gia User', email: 'sell1@gmail.com', role: 'USER', status: 'ACTIVE', joinedAt: '2026-06-28T09:00:00+07:00', auctions: 4, bids: 3 },
  { id: 'u-03', fullName: 'Quản trị viên', email: 'admin@gmail.com', role: 'ADMIN', status: 'ACTIVE', joinedAt: '2026-06-01T09:00:00+07:00', auctions: 0, bids: 0 },
  { id: 'u-04', fullName: 'Lê Hoàng Nam', email: 'nam.user@gmail.com', role: 'USER', status: 'ACTIVE', joinedAt: '2026-07-05T11:30:00+07:00', auctions: 0, bids: 7 },
  { id: 'u-05', fullName: 'Vintage Corner', email: 'vintage.user@gmail.com', role: 'USER', status: 'INACTIVE', joinedAt: '2026-06-18T14:00:00+07:00', auctions: 3, bids: 2 },
];

export const mockCategories = [
  { id: 'cat-watch', name: 'Đồng hồ', slug: 'dong-ho', items: 12, status: 'ACTIVE' },
  { id: 'cat-camera', name: 'Máy ảnh', slug: 'may-anh', items: 8, status: 'ACTIVE' },
  { id: 'cat-audio', name: 'Âm thanh', slug: 'am-thanh', items: 15, status: 'ACTIVE' },
  { id: 'cat-collectible', name: 'Sưu tầm', slug: 'suu-tam', items: 21, status: 'ACTIVE' },
];
