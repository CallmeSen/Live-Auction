import axiosClient from '../api/axiosClient';

/**
 * @typedef {'WINNING' | 'OUTBID' | 'CANCELLED'} BidStatus
 */

/**
 * @typedef {Object} MyBidsQuery
 * @property {number} [page=1]
 * @property {number} [pageSize=20] - tối đa 100
 * @property {BidStatus} [status]
 */

export const bidService = {
  /**
   * Đặt giá cho 1 item đang mở đấu giá
   * @param {string} itemId
   * @param {{ amount: number|string }} payload
   */
  placeBid: (itemId, payload) =>
    axiosClient.post(`/auction-items/${itemId}/bids`, payload),

  /**
   * Lấy lịch sử đặt giá của chính người đang đăng nhập
   * @param {MyBidsQuery} [params]
   */
  getMyBids: (params = {}) => axiosClient.get('/bids/my', { params }),
};

export default bidService;
