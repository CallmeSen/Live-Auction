import axiosClient from '../api/axiosClient';

/**
 * @typedef {'SCHEDULED' | 'ACTIVE' | 'ENDED' | 'CANCELLED'} AuctionSessionStatus
 */

/**
 * @typedef {Object} AuctionSessionQuery
 * @property {number} [page=1]
 * @property {number} [size=10] - tối đa 100
 * @property {AuctionSessionStatus} [status]
 * @property {string} [keyword] - tối đa 255 ký tự, tìm theo title/description
 */

/**
 * @typedef {Object} CreateAuctionSessionPayload
 * @property {string} title - 1-255 ký tự
 * @property {string} [description]
 * @property {string} startTime - ISO datetime
 * @property {string} endTime - ISO datetime, phải sau startTime
 * @property {number|string} minIncrement - > 0
 */

export const auctionSessionService = {
  /**
   * Lấy danh sách tất cả auction session (public)
   * @param {AuctionSessionQuery} [params]
   */
  getAll: (params = {}) => axiosClient.get('/auction-sessions', { params }),

  /**
   * Lấy danh sách auction session của chính người đang đăng nhập (cần token)
   * @param {AuctionSessionQuery} [params]
   */
  getMine: (params = {}) =>
    axiosClient.get('/auction-sessions/mine', { params }),

  /**
   * Lấy chi tiết 1 auction session, gồm cả danh sách item
   * @param {string} sessionId
   */
  getById: (sessionId) => axiosClient.get(`/auction-sessions/${sessionId}`),

  /**
   * Tạo auction session mới (cần token)
   * @param {CreateAuctionSessionPayload} payload
   */
  create: (payload) => axiosClient.post('/auction-sessions', payload),

  /**
   * Bắt đầu (kích hoạt) auction session — chỉ chủ sở hữu hoặc admin
   * @param {string} sessionId
   */
  start: (sessionId) =>
    axiosClient.patch(`/auction-sessions/${sessionId}/start`),
};

export default auctionSessionService;
