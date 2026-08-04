import type { AuctionSessionStatus } from './auctionSession';
import type { BidStatus } from './bid';

export type AuctionItemStatus = 'SOLD' | 'UNSOLD' | 'CANCELLED';

export interface AuctionItemSummaryResponse {
  id: string;
  title: string;
  startingPrice: string;
  currentPrice: string;
  status: AuctionItemStatus;
  primaryImageUrl: string | null;
}

export interface CreateAuctionItemRequest {
  categoryId?: string | null;
  title: string;
  description?: string | null;
  startingPrice: number;
}

export interface CreateAuctionItemResponse {
  id: string;
  sessionId: string;
  sellerId: string;
  categoryId: string | null;
  title: string;
  description: string | null;
  startingPrice: string;
  currentPrice: string;
  status: AuctionItemStatus;
}

export interface AuctionItemSellerResponse {
  id: string;
  fullName: string;
}

export interface AuctionItemSessionResponse {
  id: string;
  title: string;
  status: AuctionSessionStatus;
  sellerId: string;
  endTime: string;
  minIncrement: string;
}

export interface AuctionItemImageResponse {
  imageUrl: string | null;
  isPrimary: boolean;
}

export interface AuctionItemBidResponse {
  id: string;
  bidderName: string;
  amount: string;
  status: BidStatus;
  createdAt: string;
}

export interface AuctionItemDetailResponse {
  id: string;
  sessionId: string;
  categoryId: string | null;
  title: string;
  description: string | null;
  startingPrice: string;
  currentPrice: string;
  status: AuctionItemStatus;
  seller: AuctionItemSellerResponse;
  session: AuctionItemSessionResponse;
  images: AuctionItemImageResponse[];
  bids: AuctionItemBidResponse[];
}

export interface UpdateAuctionItemRequest {
  categoryId?: string | null;
  title?: string;
  description?: string | null;
  startingPrice?: number;
}

export interface DeleteAuctionItemResponse {
  id: string;
}

export interface UploadAuctionItemImageRequest {
  file: File;
  isPrimary?: boolean;
}

export interface UploadAuctionItemImageResponse {
  id: string;
  itemId: string;
  imageUrl: string;
  isPrimary: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface UploadAuctionItemImagesRequest {
  files: File[];
  primaryIndex?: number;
}

export interface UploadAuctionItemImagesResponse {
  images: UploadAuctionItemImageResponse[];
}
