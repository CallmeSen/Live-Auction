import type {
  CategoryListRequest,
  CategoryListResponse,
} from '../interfaces/category';

export const createDefaultCategoryList = (
  request: CategoryListRequest = {},
): CategoryListResponse => ({
  items: [],
  page: request.page ?? 1,
  size: request.size ?? 10,
  total: 0,
});
