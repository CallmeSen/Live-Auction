import axiosClient from './axiosClient';
import type {
  GetAuctionItemDetailResponse,
  ListAuctionItemsParams,
  ListAuctionItemsResponse,
} from '../types/itemTypes';

export const auctionItemApi = {
  list: (params: ListAuctionItemsParams = {}) =>
    axiosClient.get<ListAuctionItemsResponse>('/auction-items', { params }),

  getById: (itemId: string) =>
    axiosClient.get<GetAuctionItemDetailResponse>(`/auction-items/${itemId}`),
};
