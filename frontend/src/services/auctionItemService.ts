import type {
  AuctionItemDetailResponse,
  CreateAuctionItemRequest,
  CreateAuctionItemResponse,
  DeleteAuctionItemResponse,
  UpdateAuctionItemRequest,
  UploadAuctionItemImageRequest,
  UploadAuctionItemImageResponse,
  UploadAuctionItemImagesRequest,
  UploadAuctionItemImagesResponse,
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

  async updateItem(
    itemId: string,
    payload: UpdateAuctionItemRequest,
  ): Promise<CreateAuctionItemResponse> {
    const response = await axiosClient.patch<
      ApiResponse<CreateAuctionItemResponse>
    >(`/auction-items/${itemId}`, payload);

    return response.data.data;
  },

  async deleteItem(itemId: string): Promise<DeleteAuctionItemResponse> {
    const response = await axiosClient.delete<
      ApiResponse<DeleteAuctionItemResponse>
    >(`/auction-items/${itemId}`);

    return response.data.data;
  },

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

    const response = await axiosClient.post<
      ApiResponse<UploadAuctionItemImageResponse>
    >(`/auction-items/${itemId}/images`, formData);

    return response.data.data;
  },

  async uploadImages(
    itemId: string,
    payload: UploadAuctionItemImagesRequest,
  ): Promise<UploadAuctionItemImagesResponse> {
    const images: UploadAuctionItemImageResponse[] = [];
    const primaryIndex = payload.primaryIndex ?? 0;

    for (const [index, file] of payload.files.entries()) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append(
        'isPrimary',
        String(index === primaryIndex),
      );

      const response = await axiosClient.post<
        ApiResponse<UploadAuctionItemImageResponse>
      >(`/auction-items/${itemId}/images`, formData);

      images.push(response.data.data);
    }

    return { images };
  },
};
