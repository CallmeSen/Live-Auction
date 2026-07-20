import axiosClient from './axiosClient';
import type { AuctionStatus } from '../features/auction/types';

export interface AuctionQuery {
  status?: AuctionStatus;
  categoryId?: string;
  title?: string;
  page?: number;
  size?: number;
  sort?: string;
}

export const auctionSessionApi = {
  getAll: (params: AuctionQuery = {}) => axiosClient.get('/auction-sessions', { params }),
  getById: (auctionSessionId: string | number) => axiosClient.get(`/auction-sessions/${auctionSessionId}`),
  create: (payload: FormData) => axiosClient.post('/auction-sessions', payload, { headers: { 'Content-Type': 'multipart/form-data' } }),
  update: (auctionSessionId: string | number, payload: FormData) => axiosClient.put(`/auction-sessions/${auctionSessionId}`, payload, { headers: { 'Content-Type': 'multipart/form-data' } }),
  getMine: () => axiosClient.get('/auction-sessions/my'),

};
