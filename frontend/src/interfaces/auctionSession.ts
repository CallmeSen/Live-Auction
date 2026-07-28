import type { AuctionItemSummaryResponse } from './auctionItem';

export type AuctionSessionStatus =
  | 'PENDING_APPROVAL'
  | 'SCHEDULED'
  | 'ACTIVE'
  | 'ENDED'
  | 'REJECTED'
  | 'CANCELLED';

export interface AuctionSessionListRequest {
  page?: number;
  size?: number;
  status?: AuctionSessionStatus;
  keyword?: string;
  categoryId?: string;
}

export interface AuctionSessionRuleResponse {
  minIncrement: string;
}

export interface AuctionSessionListItemResponse {
  id: string;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string;
  status: AuctionSessionStatus;
  sellerName: string;
  primaryImageUrl: string | null;
}

export interface AuctionSessionListResponse {
  items: AuctionSessionListItemResponse[];
  page: number;
  size: number;
  total: number;
}

export interface AuctionSessionSellerResponse {
  id: string;
  fullName: string;
}

export interface AuctionSessionDetailResponse {
  id: string;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string;
  status: AuctionSessionStatus;
  seller: AuctionSessionSellerResponse;
  rule: AuctionSessionRuleResponse;
  items: AuctionItemSummaryResponse[];
}

export interface CreateAuctionSessionRequest {
  title: string;
  description?: string | null;
  startTime: string;
  endTime: string;
  minIncrement: number;
}

export interface CreateAuctionSessionResponse {
  id: string;
  sellerId: string;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string;
  status: AuctionSessionStatus;
  rule: AuctionSessionRuleResponse;
}

export interface StartAuctionSessionResponse {
  id: string;
  status: AuctionSessionStatus;
  startedAt: string;
}

export interface RejectAuctionSessionRequest {
  reason?: string | null;
}

export interface ApproveAuctionSessionResponse {
  id: string;
  status: AuctionSessionStatus;
  approvedAt: string;
}

export interface RejectAuctionSessionResponse {
  id: string;
  status: AuctionSessionStatus;
  rejectedAt: string;
  reason: string | null;
}

export interface CancelAuctionSessionRequest {
  reason?: string | null;
}

export interface CancelAuctionSessionResponse {
  id: string;
  status: AuctionSessionStatus;
  cancelledAt: string;
  reason: string | null;
}
