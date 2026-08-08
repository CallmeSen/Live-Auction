import { adminApi, type AdminItemCommand, type AdminSessionCommand } from './adminApi';

export type AdminSessionStatus = 'DRAFT' | 'SCHEDULED' | 'LIVE' | 'COMPLETED' | 'CANCELLED';
export type AdminSessionReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type AdminItemStatus = 'WAITING' | 'LIVE' | 'PAUSED' | 'PENDING_ADMIN_APPROVAL' | 'SOLD' | 'UNSOLD' | 'CANCELLED';

export type AdminSession = {
  id: string;
  title: string;
  description: string;
  status: AdminSessionStatus;
  reviewStatus: AdminSessionReviewStatus;
  itemCount: number;
  startTime?: number;
  activeItemId?: string;
  currentSequence?: number;
  sellerSub?: string;
  createdAt: number;
  updatedAt: number;
};

export type AdminItem = {
  id: string;
  sessionId: string;
  sequenceNumber: number;
  name: string;
  description: string;
  categoryId: string | null;
  startPrice: string;
  durationSeconds: number;
  status: AdminItemStatus;
  imageKeys: string[];
  finalPrice?: string;
  createdAt: number;
  updatedAt: number;
};

export type AdminSessionDetail = {
  session: AdminSession;
  items: AdminItem[];
};

export type AdminCursorPage<T> = { items: T[]; nextCursor: string | null };

export type AdminDashboard = {
  sessionCounts: Record<string, number>;
  itemCounts: Record<string, number>;
  recentSessions: AdminSession[];
  truncated: boolean;
};

function invalidResponse(): Error {
  return new Error('The server returned invalid catalog data.');
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw invalidResponse();
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value !== 'string') throw invalidResponse();
  return value;
}

function integer(value: unknown): number {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw invalidResponse();
    return value;
  }
  if (typeof value !== 'string' || !/^-?\d+$/.test(value)) throw invalidResponse();
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw invalidResponse();
  return parsed;
}

function optionalText(value: unknown): string | undefined {
  return value === undefined ? undefined : text(value);
}

const SESSION_STATUSES = new Set<AdminSessionStatus>([
  'DRAFT', 'SCHEDULED', 'LIVE', 'COMPLETED', 'CANCELLED',
]);
const ITEM_STATUSES = new Set<AdminItemStatus>([
  'WAITING', 'LIVE', 'PAUSED', 'PENDING_ADMIN_APPROVAL', 'SOLD', 'UNSOLD', 'CANCELLED',
]);
const SESSION_REVIEW_STATUSES = new Set<AdminSessionReviewStatus>([
  'PENDING', 'APPROVED', 'REJECTED',
]);

function enumValue<T extends string>(value: unknown, values: Set<T>): T {
  if (typeof value !== 'string' || !values.has(value as T)) throw invalidResponse();
  return value as T;
}

function mapSession(value: unknown): AdminSession {
  const dto = record(value);
  const session: AdminSession = {
    id: text(dto.session_id),
    title: text(dto.title),
    description: text(dto.description),
    status: enumValue(dto.status, SESSION_STATUSES),
    reviewStatus: enumValue(dto.review_status ?? 'APPROVED', SESSION_REVIEW_STATUSES),
    itemCount: integer(dto.item_count),
    createdAt: integer(dto.created_at),
    updatedAt: integer(dto.updated_at),
  };
  const startTime = dto.start_time === undefined ? undefined : integer(dto.start_time);
  const activeItemId = dto.active_item_id === undefined ? undefined : text(dto.active_item_id);
  const currentSequence = dto.current_sequence === undefined ? undefined : integer(dto.current_sequence);
  const sellerSub = optionalText(dto.seller_sub);
  if (startTime !== undefined) session.startTime = startTime;
  if (activeItemId !== undefined) session.activeItemId = activeItemId;
  if (currentSequence !== undefined) session.currentSequence = currentSequence;
  if (sellerSub !== undefined) session.sellerSub = sellerSub;
  return session;
}

function mapItem(value: unknown): AdminItem {
  const dto = record(value);
  if (!Array.isArray(dto.image_keys) || dto.image_keys.some((key) => typeof key !== 'string')) {
    throw invalidResponse();
  }
  const item: AdminItem = {
    id: text(dto.item_id),
    sessionId: text(dto.session_id),
    sequenceNumber: integer(dto.sequence_number),
    name: text(dto.name),
    description: text(dto.description),
    categoryId: dto.category_id === null ? null : text(dto.category_id),
    startPrice: text(dto.start_price),
    durationSeconds: integer(dto.duration_s),
    status: enumValue(dto.status, ITEM_STATUSES),
    imageKeys: [...dto.image_keys],
    createdAt: integer(dto.created_at),
    updatedAt: integer(dto.updated_at),
  };
  const finalPrice = optionalText(dto.final_price);
  if (finalPrice !== undefined) item.finalPrice = finalPrice;
  return item;
}

function mapPage<T>(value: unknown, mapper: (value: unknown) => T): AdminCursorPage<T> {
  const dto = record(value);
  if (!Array.isArray(dto.items) || (dto.next_cursor !== null && typeof dto.next_cursor !== 'string')) {
    throw invalidResponse();
  }
  return { items: dto.items.map(mapper), nextCursor: dto.next_cursor };
}

function mapAdminPage<T>(value: unknown, mapper: (value: unknown) => T): AdminCursorPage<T> {
  const dto = record(value);
  if (!Array.isArray(dto.items) || (dto.next_token !== null && typeof dto.next_token !== 'string')) {
    throw invalidResponse();
  }
  return { items: dto.items.map(mapper), nextCursor: dto.next_token };
}

function numberMap(value: unknown): Record<string, number> {
  const source = record(value);
  return Object.fromEntries(Object.entries(source).map(([key, entry]) => {
    if (typeof entry !== 'number' || !Number.isInteger(entry) || entry < 0) throw invalidResponse();
    return [key, entry];
  }));
}

function mapDashboard(value: unknown): AdminDashboard {
  const dto = record(value);
  if (!Array.isArray(dto.recent_sessions) || typeof dto.truncated !== 'boolean') throw invalidResponse();
  return {
    sessionCounts: numberMap(dto.session_counts),
    itemCounts: numberMap(dto.item_counts),
    recentSessions: dto.recent_sessions.map(mapSession),
    truncated: dto.truncated,
  };
}

export function createCatalogApi() {
  return {
    async listSessions(input: { status?: AdminSessionStatus; pageSize?: number; cursor?: string } = {}) {
      return mapPage(await adminApi.listSessions(input), mapSession);
    },
    async listAdminSessions(input: { status?: AdminSessionStatus; reviewStatus?: AdminSessionReviewStatus; pageSize?: number; paginationToken?: string } = {}) {
      return mapAdminPage(await adminApi.listAdminSessions(input), mapSession);
    },
    async getSession(sessionId: string): Promise<AdminSessionDetail> {
      const dto = record(await adminApi.getSession(sessionId));
      if (!Array.isArray(dto.items)) throw invalidResponse();
      return { session: mapSession(dto.session), items: dto.items.map(mapItem) };
    },
    async getAdminSession(sessionId: string): Promise<AdminSessionDetail> {
      const dto = record(await adminApi.getAdminSession(sessionId));
      if (!Array.isArray(dto.items)) throw invalidResponse();
      return { session: mapSession(dto.session), items: dto.items.map(mapItem) };
    },
    async commandSession(sessionId: string, command: AdminSessionCommand) {
      return adminApi.commandSession(sessionId, command);
    },
    async getDashboard(): Promise<AdminDashboard> {
      return mapDashboard(await adminApi.getDashboard());
    },
    async listItems(input: { status?: AdminItemStatus; pageSize?: number; cursor?: string; sessionId?: string; categoryId?: string } = {}) {
      return mapPage(await adminApi.listItems(input), mapItem);
    },
    async getItem(itemId: string) {
      return mapItem(await adminApi.getItem(itemId));
    },
    async commandItem(itemId: string, command: AdminItemCommand) {
      return adminApi.commandItem(itemId, command);
    },
  };
}

export const catalogApi = createCatalogApi();
