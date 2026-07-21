import axiosClient from '../api/axiosClient';

/**
 * @typedef {Object} CreateAuctionItemPayload
 * @property {string} title - 1-255 ký tự
 * @property {string} [description]
 * @property {string} [categoryId] - UUID category
 * @property {number|string} startingPrice - > 0
 */

export const auctionItemService = {
  /**
   * Lấy chi tiết 1 item trong phiên đấu giá
   * @param {string} itemId
   */
  getById: (itemId) => axiosClient.get(`/auction-items/${itemId}`),

  /**
   * Thêm item mới vào 1 auction session
   * @param {string} sessionId
   * @param {CreateAuctionItemPayload} payload
   */
  create: (sessionId, payload) =>
    axiosClient.post(`/auction-sessions/${sessionId}/items`, payload),
};

export default auctionItemService;
