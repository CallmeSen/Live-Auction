import axiosClient from './axiosClient';

export const bidApi = {
  place: (auctionId: string | number, amount: number) => axiosClient.post(`/auctions/${auctionId}/bids`, { amount }),
  getHistory: (auctionId: string | number) => axiosClient.get(`/auctions/${auctionId}/bids`, { params: { sort: 'createdAt,desc' } }),
  getMine: () => axiosClient.get('/bids/my'),
};
// còn thiếu