export type AuctionStatus = 'ACTIVE' | 'UPCOMING' | 'ENDED' | 'CANCELLED';
export type AuctionApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface Auction {
<<<<<<< HEAD
  id: number;
=======
  id: string | number;
>>>>>>> 3d6cdde (temp: preserve auction frontend and backend changes)
  title: string;
  category: string;
  categoryId: string;
  image: string;
  images?: string[];
  currentPrice: number;
  startingPrice: number;
  minimumBidIncrement: number;
  bidCount: number;
  startTime: string;
  endTime: string;
  createdAt: string;
  status: AuctionStatus;
  approvalStatus: AuctionApprovalStatus;
  seller: string;
  sellerEmail: string;
  location: string;
  condition: string;
  description: string;
  featured?: boolean;
  finalPrice?: number;
  winner?: string;
}

export interface BidHistory {
  id: number;
  auctionId: number;
  bidder: string;
  amount: number;
  time: string;
  isMine?: boolean;
}
