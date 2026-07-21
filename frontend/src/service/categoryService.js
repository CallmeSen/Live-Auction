import axiosClient from '../api/axiosClient';

/**
 * @typedef {'ACTIVE' | 'INACTIVE'} CategoryStatus
 */

/**
 * @typedef {Object} CategoryQuery
 * @property {number} [page=1]
 * @property {number} [size=10] - tối đa 100
 * @property {CategoryStatus} [status]
 * @property {string} [keyword] - tối đa 150 ký tự
 */

/**
 * @typedef {Object} CreateCategoryPayload
 * @property {string} name - 2-150 ký tự
 * @property {string} [slug] - chỉ chữ thường, số, dấu gạch ngang
 */

/**
 * @typedef {Object} UpdateCategoryPayload
 * @property {string} [name]
 * @property {string} [slug]
 * @property {CategoryStatus} [status]
 */

export const categoryService = {
  /**
   * Lấy danh sách category (có phân trang, filter)
   * @param {CategoryQuery} [params]
   */
  getAll: (params = {}) => axiosClient.get('/categories', { params }),

  /**
   * Lấy chi tiết 1 category
   * @param {string} categoryId
   */
  getById: (categoryId) => axiosClient.get(`/categories/${categoryId}`),

  /**
   * Tạo category mới (chỉ admin)
   * @param {CreateCategoryPayload} payload
   */
  create: (payload) => axiosClient.post('/categories', payload),

  /**
   * Cập nhật category (chỉ admin)
   * @param {string} categoryId
   * @param {UpdateCategoryPayload} payload
   */
  update: (categoryId, payload) =>
    axiosClient.patch(`/categories/${categoryId}`, payload),

  /**
   * Vô hiệu hoá category (soft delete, chỉ admin)
   * @param {string} categoryId
   */
  delete: (categoryId) => axiosClient.delete(`/categories/${categoryId}`),
};

export default categoryService;
