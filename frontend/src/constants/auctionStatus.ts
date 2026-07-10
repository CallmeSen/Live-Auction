import type { AuctionStatus } from '../features/auction/types';

export const auctionStatusLabel: Record<AuctionStatus, string> = {
  ACTIVE: 'Đang diễn ra',
  UPCOMING: 'Sắp diễn ra',
  ENDED: 'Đã kết thúc',
  CANCELLED: 'Đã hủy',
};

export const auctionStatusTone: Record<AuctionStatus, string> = {
  ACTIVE: 'border-[#C2452D]/50 bg-[#C2452D]/15 text-[#ff9a86]',
  UPCOMING: 'border-[#C9A227]/40 bg-[#C9A227]/10 text-[#e0c15a]',
  ENDED: 'border-[#566b5c] bg-[#1d2d23] text-[#a7b5ac]',
  CANCELLED: 'border-[#6f3d38] bg-[#3f201c]/30 text-[#d8897b]',
};
