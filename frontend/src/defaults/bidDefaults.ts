import type {
  MyBidListRequest,
  MyBidListResponse,
} from '../interfaces/bid';

export const createDefaultMyBidList = (
  request: MyBidListRequest = {},
): MyBidListResponse => ({
  items: [],
  page: request.page ?? 1,
  pageSize: request.pageSize ?? 10,
  total: 0,
});
