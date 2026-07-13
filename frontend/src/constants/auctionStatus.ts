import type { AuctionApprovalStatus, AuctionStatus } from '../features/auction/types';

export const auctionStatusLabel: Record<AuctionStatus, string> = {
  ACTIVE: 'Đang diễn ra',
  UPCOMING: 'Sắp diễn ra',
  ENDED: 'Đã kết thúc',
  CANCELLED: 'Đã hủy',
};

export const auctionStatusTone: Record<AuctionStatus, string> = {
  ACTIVE: 'border-[var(--color-danger-solid)]/50 bg-[var(--color-danger-solid)]/15 text-[var(--color-danger)]',
  UPCOMING: 'border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10 text-[var(--color-primary-hover)]',
  ENDED: 'border-[var(--color-border-strong)] bg-[var(--color-surface-raised)] text-[var(--color-text-muted)]',
  CANCELLED: 'border-[var(--color-danger-border)] bg-[var(--color-surface-raised)]/30 text-[var(--color-danger)]',
};

export const approvalStatusLabel: Record<AuctionApprovalStatus, string> = {
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Bị từ chối',
};

export const approvalStatusTone: Record<AuctionApprovalStatus, string> = {
  PENDING: 'border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10 text-[var(--color-primary-hover)]',
  APPROVED: 'border-[var(--color-success-border)]/40 bg-[var(--color-success-bg)]/15 text-[var(--color-success)]',
  REJECTED: 'border-[var(--color-danger-solid)]/40 bg-[var(--color-danger-solid)]/10 text-[var(--color-danger)]',
};
