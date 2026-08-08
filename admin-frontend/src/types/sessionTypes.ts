import type { 
    UUID, 
    Money 
} from '../type/type';

import {
  AuctionItemStatus,
  AuctionSessionStatus,
} from '../type/type';

/**
 * POST /api/v1/auction-sessions
 */
export interface CreateAuctionSessionRequest {
  title: string;
  description?: string | null;

  /**
   * ISO datetime string.
   * Ví dụ: "2026-07-20T09:00:00"
   */
  startTime: string;

  /**
   * ISO datetime string.
   * Ví dụ: "2026-07-20T18:00:00"
   */
  endTime: string;

  minIncrement: Money;
}

export interface AuctionSessionRuleData {
  minIncrement: Money;
}

export interface CreateAuctionSessionData {
  id: UUID;
  sellerId: UUID;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string;
  status: AuctionSessionStatus;
  rule: AuctionSessionRuleData;
}

export interface CreateAuctionSessionResponse {
  status: number;
  code: number;
  message: string;
  data: CreateAuctionSessionData;
}

/**
 * Một auction session trong danh sách.
 */
export interface AuctionSessionListItem {
  id: UUID;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string;
  status: AuctionSessionStatus;
  sellerName: string;
}

export interface AuctionSessionListData {
  items: AuctionSessionListItem[];
  page: number;
  size: number;
  total: number;
}

/**
 * GET /api/v1/auction-sessions
 */
export interface ListAuctionSessionsResponse {
  status: number;
  code: number;
  message: string;
  data: AuctionSessionListData;
}

export interface AuctionSessionSellerData {
  id: UUID;
  fullName: string;
}

export interface AuctionSessionItemSummary {
  id: UUID;
  title: string;
  startingPrice: Money;
  currentPrice: Money;
  status: AuctionItemStatus;
  primaryImageUrl: string | null;
}

export interface AuctionSessionDetailData {
  id: UUID;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string;
  status: AuctionSessionStatus;
  seller: AuctionSessionSellerData;
  rule: AuctionSessionRuleData;
  items: AuctionSessionItemSummary[];
}

/**
 * GET /api/v1/auction-sessions/{sessionId}
 */
export interface GetAuctionSessionDetailResponse {
  status: number;
  code: number;
  message: string;
  data: AuctionSessionDetailData;
}

export interface StartAuctionSessionData {
  id: UUID;
  status: AuctionSessionStatus;
  startedAt: string;
}

/**
 * PATCH /api/v1/auction-sessions/{sessionId}/start
 */
export interface StartAuctionSessionResponse {
  status: number;
  code: number;
  message: string;
  data: StartAuctionSessionData;
}