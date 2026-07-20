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
  
  export enum AuctionItemSortBy {
    CREATED_AT = 'createdAt',
    CURRENT_PRICE = 'currentPrice',
    STARTING_PRICE = 'startingPrice',
    TITLE = 'title',
    OPENED_AT = 'openedAt',
    CLOSED_AT = 'closedAt',
  }
  
  export enum SortOrder {
    ASC = 'asc',
    DESC = 'desc',
  }
  
  /**
   * POST /api/v1/auction-sessions/{sessionId}/items
   */
  export interface CreateAuctionItemRequest {
    categoryId?: UUID | null;
    title: string;
    description?: string | null;
    startingPrice: Money;
  }
  
  export interface CreateAuctionItemData {
    id: UUID;
    sessionId: UUID;
    sellerId: UUID;
    categoryId: UUID | null;
    title: string;
    description: string | null;
    startingPrice: Money;
    currentPrice: Money;
    status: AuctionItemStatus;
  }
  
  export interface CreateAuctionItemResponse {
    status: number;
    code: number;
    message: string;
    data: CreateAuctionItemData;
  }
  
  export interface AuctionItemSellerData {
    id: UUID;
    fullName: string;
  }
  
  export interface AuctionItemSessionData {
    id: UUID;
    title: string;
    status: AuctionSessionStatus;
    endTime: ISODateTime;
    minIncrement: Money;
  }
  
  export interface AuctionItemImageData {
    imageUrl: string;
    isPrimary: boolean;
  }
  
  export interface AuctionItemBidData {
    id: UUID;
    bidderName: string;
    amount: Money;
    status: BidStatus;
    createdAt: ISODateTime;
  }
  
  export interface AuctionItemDetailData {
    id: UUID;
    sessionId: UUID;
    title: string;
    description: string | null;
    startingPrice: Money;
    currentPrice: Money;
    status: AuctionItemStatus;
    seller: AuctionItemSellerData;
    session: AuctionItemSessionData;
    images: AuctionItemImageData[];
    bids: AuctionItemBidData[];
  }
  
  /**
   * GET /api/v1/auction-items/{itemId}
   */
  export interface GetAuctionItemDetailResponse {
    status: number;
    code: number;
    message: string;
    data: AuctionItemDetailData;
  }
  
  export interface AuctionItemListCategoryData {
    id: UUID;
    name: string;
    slug: string;
  }
  
  export interface AuctionItemListSessionData {
    id: UUID;
    title: string;
    status: AuctionSessionStatus;
    startTime: ISODateTime;
    endTime: ISODateTime;
    minIncrement: Money;
  }
  
  export interface AuctionItemListItem {
    id: UUID;
    title: string;
    description: string | null;
    startingPrice: Money;
    currentPrice: Money;
    finalPrice: Money | null;
    status: AuctionItemStatus;
    openedAt: ISODateTime | null;
    closedAt: ISODateTime | null;
    createdAt: ISODateTime;
    primaryImageUrl: string | null;
    bidCount: number;
    seller: AuctionItemSellerData;
    category: AuctionItemListCategoryData | null;
    session: AuctionItemListSessionData;
  }
  
  export interface AuctionItemListData {
    items: AuctionItemListItem[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }
  
  /**
   * GET /api/v1/auction-items
   */
  export interface ListAuctionItemsResponse {
    status: number;
    code: number;
    message: string;
    data: AuctionItemListData;
  }
  
  /**
   * Query parameters for GET /api/v1/auction-items
   */
  export interface ListAuctionItemsParams {
    page?: number;
    pageSize?: number;
    status?: AuctionItemStatus;
    sessionId?: UUID;
    categoryId?: UUID;
    keyword?: string;
    sortBy?: AuctionItemSortBy;
    sortOrder?: SortOrder;
  }