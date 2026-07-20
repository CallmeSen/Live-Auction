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

<<<<<<< HEAD
export const auctionSessionApi = {
  getAll: (params: AuctionQuery = {}) => axiosClient.get('/auction-sessions', { params }),
  getById: (auctionId: string | number) => axiosClient.get(`/auction-sessions/${auctionId}`),
  getBidHistory: (auctionId: string | number) => axiosClient.get(`/auction-sessions/${auctionId}/bids`, { params: { sort: 'createdAt,desc' } }),
  create: (payload: FormData) => axiosClient.post('/auction-sessions', payload, { headers: { 'Content-Type': 'multipart/form-data' } }),
  getMine: () => axiosClient.get('/auction-sessions/my'),
=======
export const auctionApi = {
  getAll: (params: AuctionQuery = {}) => axiosClient.get('/auctions', { params }),
  getById: (auctionId: string | number) => axiosClient.get(`/auctions/${auctionId}`),
  getBidHistory: (auctionId: string | number) => axiosClient.get(`/auctions/${auctionId}/bids`, { params: { sort: 'createdAt,desc' } }),
  create: (payload: FormData) => axiosClient.post('/auctions', payload, { headers: { 'Content-Type': 'multipart/form-data' } }),
  getMine: () => axiosClient.get('/auctions/my'),
>>>>>>> 3d6cdde (temp: preserve auction frontend and backend changes)
  update: (auctionId: string | number, payload: FormData) => axiosClient.put(`/auctions/${auctionId}`, payload, { headers: { 'Content-Type': 'multipart/form-data' } }),
  cancel: (auctionId: string | number) => axiosClient.patch(`/auctions/${auctionId}/cancel`),
  getCategories: () => axiosClient.get('/categories', { params: { status: 'ACTIVE' } }),
};
// còn thiếu getCategories, update, cancel, getMine,getBidHistory