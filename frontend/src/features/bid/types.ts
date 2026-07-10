import type { AuctionStatus } from '../auction/types';

export interface MyBid {
  id: number;
  auctionId: number;
  auctionTitle: string;
  image: string;
  myBid: number;
  currentPrice: number;
  bidTime: string;
  status: 'WINNING' | 'OUTBID' | 'WON';
  auctionStatus: AuctionStatus;
  auctionEndTime: string;
}
