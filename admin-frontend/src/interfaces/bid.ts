import type { AuctionItemStatus } from './auctionItem';
import type { AuctionSessionStatus } from './auctionSession';

export type BidStatus =
  | 'WINNING'
  | 'OUTBID'
  | 'CANCELLED';

export type MyBidOutcome =
  | 'LEADING'
  | 'OUTBID'
  | 'WON'
  | 'LOST';

export interface PlaceBidRequest {
  amount: number;
}

export interface PlaceBidResponse {
  id: string;
  itemId: string;
  sessionId: string;
  bidderId: string;
  amount: string;
  status: BidStatus;
  createdAt: string;
}

export interface MyBidListRequest {
  page?: number;
  pageSize?: number;
  outcome?: MyBidOutcome;
}

export interface MyBidListItemResponse {
  id: string;
  amount: string;
  status: BidStatus;
  outcome: MyBidOutcome;
  createdAt: string;
  itemId: string;
  itemTitle: string;
  itemStatus: AuctionItemStatus;
  itemCurrentPrice: string;
  itemFinalPrice: string | null;
  sessionId: string;
  sessionTitle: string;
  sessionStatus: AuctionSessionStatus;
}

export interface MyBidListResponse {
  items: MyBidListItemResponse[];
  page: number;
  pageSize: number;
  total: number;
}
