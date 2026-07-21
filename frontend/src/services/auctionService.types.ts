export type AuctionSessionStatus =
    | 'SCHEDULED'
    | 'ACTIVE'
    | 'ENDED'
    | 'CANCELLED';

export type AuctionItemStatus =
    | 'DRAFT'
    | 'READY'
    | 'OPEN'
    | 'SOLD'
    | 'UNSOLD'
    | 'CANCELLED';

export type BidStatus =
    | 'WINNING'
    | 'OUTBID'
    | 'CANCELLED';

export interface AuctionSessionListRequest {
    page?: number;
    size?: number;
    status?: AuctionSessionStatus;
    keyword?: string;
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

export interface AuctionItemSummaryResponse {
    id: string;
    title: string;
    startingPrice: string;
    currentPrice: string;
    status: AuctionItemStatus;
    primaryImageUrl: string | null;
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
    endTime: string;
    minIncrement: string;
}

export interface AuctionItemImageResponse {
    imageUrl: string;
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