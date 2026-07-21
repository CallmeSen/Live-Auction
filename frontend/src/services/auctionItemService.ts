import type {
  AuctionItemDetailResponse,
  CreateAuctionItemRequest,
  CreateAuctionItemResponse,
} from '../interfaces/auctionItem';
import type { ApiResponse } from '../interfaces/common';
import axiosClient from './axiosClient';

export const auctionItemService = {
  async getItemById(
    itemId: string,
  ): Promise<AuctionItemDetailResponse> {
    const response = await axiosClient.get<
      ApiResponse<AuctionItemDetailResponse>
    >(`/auction-items/${itemId}`);

    return response.data.data;
  },

  async createItem(
    sessionId: string,
    payload: CreateAuctionItemRequest,
  ): Promise<CreateAuctionItemResponse> {
    const response = await axiosClient.post<
      ApiResponse<CreateAuctionItemResponse>
    >(`/auction-sessions/${sessionId}/items`, payload);

    return response.data.data;
  },
};
