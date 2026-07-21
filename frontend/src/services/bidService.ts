import axiosClient from './axiosClient';
import type { ApiResponse } from './types';
import type {
    AuctionItemStatus,
    AuctionSessionStatus,
    BidStatus,
} from './auctionService.types';

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
    status?: BidStatus;
}

export interface MyBidListItemResponse {
    id: string;
    amount: string;
    status: BidStatus;
    createdAt: string;
    itemId: string;
    itemTitle: string;
    itemStatus: AuctionItemStatus;
    itemCurrentPrice: string;
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

export const bidService = {
    async placeBid(
        itemId: string,
        payload: PlaceBidRequest,
    ): Promise<PlaceBidResponse> {
        const response = await axiosClient.post<
            ApiResponse<PlaceBidResponse>
        >(`/auction-items/${itemId}/bids`, payload);

        return response.data.data;
    },

    async getMyBids(
        params: MyBidListRequest = {},
    ): Promise<MyBidListResponse> {
        const response = await axiosClient.get<
            ApiResponse<MyBidListResponse>
        >('/bids/my', { params });

        return response.data.data;
    },
};