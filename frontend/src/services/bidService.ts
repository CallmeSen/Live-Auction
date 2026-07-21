import { createDefaultMyBidList } from '../defaults/bidDefaults';
import type {
    MyBidListRequest,
    MyBidListResponse,
    PlaceBidRequest,
    PlaceBidResponse,
} from '../interfaces/bid';
import type { ApiResponse } from '../interfaces/common';
import axiosClient from './axiosClient';

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
        try {
            const response = await axiosClient.get<
                ApiResponse<MyBidListResponse>
            >('/bids/my', { params });

            return response.data.data;
        } catch {
            return createDefaultMyBidList(params);
        }
    },
};