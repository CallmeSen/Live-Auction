import type {
  ISODateTime,
  Money,
  UUID,
} from '../type/type';

import {
  AuctionItemStatus,
  AuctionSessionStatus,
  BidStatus,
} from '../type/type';

/**
 * POST /api/v1/auction-items/{itemId}/bids
 */
export interface PlaceBidRequest {
  amount: Money;
}

export interface PlaceBidData {
  id: UUID;
  itemId: UUID;
  sessionId: UUID;
  bidderId: UUID;
  amount: Money;
  status: BidStatus;
  createdAt: ISODateTime;
}

export interface PlaceBidResponse {
  status: number;
  code: number;
  message: string;
  data: PlaceBidData;
}

/**
 * Một bid trong danh sách bid của người dùng hiện tại.
 */
export interface MyBidListItem {
  id: UUID;
  amount: Money;
  status: BidStatus;
  createdAt: ISODateTime;

  itemId: UUID;
  itemTitle: string;
  itemStatus: AuctionItemStatus;
  itemCurrentPrice: Money;

  sessionId: UUID;
  sessionTitle: string;
  sessionStatus: AuctionSessionStatus;
}

export interface MyBidListData {
  items: MyBidListItem[];
  page: number;
  pageSize: number;
  total: number;
}

/**
 * GET /api/v1/bids/my
 */
export interface ListMyBidsResponse {
  status: number;
  code: number;
  message: string;
  data: MyBidListData;
}

/**
 * Query parameters cho GET /api/v1/bids/my
 */
export interface ListMyBidsParams {
  page?: number;
  pageSize?: number;
  status?: BidStatus;
}
