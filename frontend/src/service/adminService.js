import axiosClient from '../api/axiosClient';

/**
 * @typedef {Object} CreateAdminUserPayload
 * @property {string} email
 * @property {string} password
 * @property {string} fullName - 2-255 ký tự
 * @property {string} phone
 */

export const adminService = {
  /**
   * Tạo tài khoản admin mới (chỉ admin hiện tại mới được gọi)
   * @param {CreateAdminUserPayload} payload
   */
  createAdminUser: (payload) => axiosClient.post('/api/v1/admin/users', payload),
};

export default adminService;
