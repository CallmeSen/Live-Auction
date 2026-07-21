import axiosClient from '../api/axiosClient';

/**
 * @typedef {Object} RegisterPayload
 * @property {string} email
 * @property {string} password - 6-72 ký tự
 * @property {string} fullName - 2-255 ký tự
 * @property {string} phone - 9-15 ký tự
 */

/**
 * @typedef {Object} LoginPayload
 * @property {string} email
 * @property {string} password
 */

export const authService = {
  /**
   * Đăng ký tài khoản mới
   * @param {RegisterPayload} payload
   */
  register: (payload) => axiosClient.post('/auth/register', payload),

  /**
   * Đăng nhập, trả về accessToken + thông tin user
   * @param {LoginPayload} payload
   */
  login: (payload) => axiosClient.post('/auth/login', payload),
};

export default authService;
