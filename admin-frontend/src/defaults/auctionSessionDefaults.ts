import type {
  AuctionSessionListRequest,
  AuctionSessionListResponse,
} from '../interfaces/auctionSession';

export const createDefaultAuctionSessionList = (
  request: AuctionSessionListRequest = {},
): AuctionSessionListResponse => ({
  items: [],
  page: request.page ?? 1,
  size: request.size ?? 10,
  total: 0,
});
