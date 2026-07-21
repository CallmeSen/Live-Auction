import type {
  AuctionItemDetailResponse,
  CreateAuctionItemRequest,
  CreateAuctionItemResponse,
  UploadAuctionItemImageRequest,
  UploadAuctionItemImageResponse,
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

  // TODO(BACKEND): POST /auction-items/{itemId}/images chua duoc trien khai.
  async uploadImage(
    itemId: string,
    payload: UploadAuctionItemImageRequest,
  ): Promise<UploadAuctionItemImageResponse> {
    const formData = new FormData();
    formData.append('file', payload.file);
    formData.append(
      'isPrimary',
      String(payload.isPrimary ?? false),
    );
    formData.append(
      'sortOrder',
      String(payload.sortOrder ?? 0),
    );

    const response = await axiosClient.post<
      ApiResponse<UploadAuctionItemImageResponse>
    >(`/auction-items/${itemId}/images`, formData);

    return response.data.data;
  },
};
