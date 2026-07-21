import type {
  AdminUserListRequest,
  AdminUserListResponse,
} from '../interfaces/admin';

export const createDefaultAdminUserList = (
  request: AdminUserListRequest = {},
): AdminUserListResponse => ({
  items: [],
  page: request.page ?? 1,
  size: request.size ?? 10,
  total: 0,
});
