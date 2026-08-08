import type { ServerlessRestClient } from './restClient';
import { ServerlessApiError } from './contracts';
import {
  mapBid,
  mapCategory,
  mapCategoryPage,
  mapCreateSessionResult,
  mapCreateItemResult,
  mapCursorPage,
  mapItem,
  mapSession,
  mapSessionDetail,
  mapPutRulesResult,
  mapScheduleSessionResult,
  mapPresignedPost,
  mapUserProfile,
  type AuctionItem,
  type AuctionSession,
  type BidHistoryItem,
  type AuctionCategory,
  type CursorPage,
  type CreateSessionResult,
  type CreateItemResult,
  type ItemStatus,
  type SessionDetail,
  type SessionStatus,
  type PutRulesResult,
  type ScheduleSessionResult,
  type UserProfile,
} from './mappers';
import type { PresignedPost } from './contracts';

export type { AuctionCategory } from './mappers';

export type CursorInput = { pageSize?: number; cursor?: string };

export type CreateSessionDto = {
  title: string;
  description: string;
};

export type RulesDto = {
  min_increment: string;
  max_increment: string;
  anti_snipe_window_s: number;
  anti_snipe_extend_s: number;
  max_extensions: number;
  public_history_limit: number;
};

export type ScheduleSessionDto = {
  start_time: number;
};

export type CreateItemDto = {
  name: string;
  description: string;
  category_id: string | null;
  sequence_number: number;
  start_price: string;
  duration_s: number;
};

export type ImageMetadataDto = {
  content_type: 'image/jpeg' | 'image/png' | 'image/webp';
  size_bytes: number;
};

export type CatalogApi = {
  getProfile(): Promise<UserProfile>;
  listSessions(input: CursorInput & { status?: SessionStatus }): Promise<CursorPage<AuctionSession>>;
  getSession(sessionId: string): Promise<SessionDetail>;
  listItems(input: CursorInput & {
    status?: ItemStatus;
    sessionId?: string;
    categoryId?: string;
  }): Promise<CursorPage<AuctionItem>>;
  getItem(itemId: string): Promise<AuctionItem>;
  listMyBids(input: CursorInput): Promise<CursorPage<BidHistoryItem>>;
  listCategories(input: CursorInput): Promise<CursorPage<AuctionCategory>>;
  createSession(payload: CreateSessionDto): Promise<CreateSessionResult>;
  putRules(sessionId: string, payload: RulesDto): Promise<PutRulesResult>;
  listMySessions(input: CursorInput): Promise<CursorPage<AuctionSession>>;
  scheduleSession(
    sessionId: string,
    payload: ScheduleSessionDto,
  ): Promise<ScheduleSessionResult>;
  createItem(sessionId: string, payload: CreateItemDto): Promise<CreateItemResult>;
  presignItemImage(itemId: string, payload: ImageMetadataDto): Promise<PresignedPost>;
};

function definedParams(
  input: Record<string, string | number | undefined>,
): Record<string, string | number> {
  return Object.fromEntries(
    Object.entries(input).filter((entry): entry is [string, string | number] => (
      entry[1] !== undefined
    )),
  );
}

function forwardPage<T>(
  data: unknown,
  mapper: (item: unknown) => T,
  requestCursor: string | undefined,
): CursorPage<T> {
  const page = mapCursorPage(data, mapper);
  if (requestCursor !== undefined && page.nextCursor === requestCursor) {
    throw new ServerlessApiError(
      502,
      'INVALID_RESPONSE_DATA',
      'The server returned invalid catalog data.',
    );
  }
  return page;
}

export function createCatalogApi(client: ServerlessRestClient): CatalogApi {
  return {
    async getProfile() {
      const envelope = await client.get<unknown>('/api/v1/users/me');
      return mapUserProfile(envelope.data);
    },

    async listSessions(input) {
      const envelope = await client.get<unknown>('/api/v1/auction-sessions', {
        params: definedParams({
          status: input.status,
          pageSize: input.pageSize,
          cursor: input.cursor,
        }),
      });
      return forwardPage(envelope.data, mapSession, input.cursor);
    },

    async getSession(sessionId) {
      const envelope = await client.get<unknown>(
        `/api/v1/auction-sessions/${encodeURIComponent(sessionId)}`,
      );
      return mapSessionDetail(envelope.data);
    },

    async listItems(input) {
      const envelope = await client.get<unknown>('/api/v1/auction-items', {
        params: definedParams({
          status: input.status,
          pageSize: input.pageSize,
          cursor: input.cursor,
          sessionId: input.sessionId,
          categoryId: input.categoryId,
        }),
      });
      return forwardPage(envelope.data, mapItem, input.cursor);
    },

    async getItem(itemId) {
      const envelope = await client.get<unknown>(
        `/api/v1/auction-items/${encodeURIComponent(itemId)}`,
      );
      return mapItem(envelope.data);
    },

    async listMyBids(input) {
      const envelope = await client.get<unknown>('/api/v1/bids/my', {
        params: definedParams({
          pageSize: input.pageSize,
          cursor: input.cursor,
        }),
      });
      return forwardPage(envelope.data, mapBid, input.cursor);
    },

    async listCategories(input) {
      const envelope = await client.get<unknown>('/api/v1/categories', {
        params: definedParams({
          pageSize: input.pageSize,
          paginationToken: input.cursor,
        }),
      });
      const page = mapCategoryPage(envelope.data, mapCategory);
      if (input.cursor !== undefined && page.nextCursor === input.cursor) {
        throw new ServerlessApiError(
          502,
          'INVALID_RESPONSE_DATA',
          'The server returned invalid category data.',
        );
      }
      return page;
    },

    async createSession(payload) {
      const envelope = await client.post<unknown>(
        '/api/v1/auction-sessions',
        payload,
      );
      return mapCreateSessionResult(envelope.data);
    },

    async putRules(sessionId, payload) {
      const envelope = await client.put<unknown>(
        `/api/v1/auction-sessions/${encodeURIComponent(sessionId)}/rules`,
        payload,
      );
      return mapPutRulesResult(envelope.data);
    },

    async listMySessions(input) {
      const envelope = await client.get<unknown>('/api/v1/auction-sessions/mine', {
        params: definedParams({
          pageSize: input.pageSize,
          cursor: input.cursor,
        }),
      });
      return forwardPage(envelope.data, mapSession, input.cursor);
    },

    async scheduleSession(sessionId, payload) {
      const envelope = await client.post<unknown>(
        `/api/v1/auction-sessions/${encodeURIComponent(sessionId)}/schedule`,
        payload,
      );
      return mapScheduleSessionResult(envelope.data);
    },

    async createItem(sessionId, payload) {
      const envelope = await client.post<unknown>(
        `/api/v1/auction-sessions/${encodeURIComponent(sessionId)}/items`,
        payload,
      );
      return mapCreateItemResult(envelope.data);
    },

    async presignItemImage(itemId, payload) {
      const envelope = await client.post<unknown>(
        `/api/v1/auction-items/${encodeURIComponent(itemId)}/images/presign`,
        payload,
      );
      return mapPresignedPost(envelope.data);
    },
  };
}
