import { ServerlessApiError, type PresignedPost } from './contracts';

export type SessionStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'LIVE'
  | 'COMPLETED'
  | 'CANCELLED';

export type ItemStatus =
  | 'WAITING'
  | 'LIVE'
  | 'PAUSED'
  | 'PENDING_ADMIN_APPROVAL'
  | 'SOLD'
  | 'UNSOLD'
  | 'CANCELLED';

export type BidStatus = 'ACCEPTED' | 'REJECTED';

export type CursorPage<T> = {
  items: T[];
  nextCursor: string | null;
};

export type AuctionSession = {
  id: string;
  title: string;
  description: string;
  status: SessionStatus;
  itemCount: number;
  startTime?: number;
  activeItemId?: string;
  currentSequence?: number;
  sellerSub?: string;
  version?: number;
  createdAt: number;
  updatedAt: number;
};

export type SessionRules = {
  minIncrement: string;
  maxIncrement: string;
  antiSnipeWindowSeconds: number;
  antiSnipeExtendSeconds: number;
  maxExtensions: number;
  publicHistoryLimit: number;
};

export type LiveItemSnapshot = {
  status: 'LIVE';
  currentPrice: string;
  endTime: number;
  extensionCount: number;
  remainingSeconds?: number;
  finalPrice?: string;
};

export type AuctionItem = {
  id: string;
  sessionId: string;
  sequenceNumber: number;
  name: string;
  description: string;
  categoryId: string | null;
  startPrice: string;
  durationSeconds: number;
  status: ItemStatus;
  imageKeys: string[];
  finalPrice?: string;
  createdAt: number;
  updatedAt: number;
  live?: LiveItemSnapshot;
};

export type BidHistoryItem = {
  itemId: string;
  sessionId?: string;
  requestId: string;
  amount: string;
  status: BidStatus;
  reason?: string;
  timestamp?: number;
  createdAt?: number;
};

export type SessionDetail = {
  session: AuctionSession;
  rules: SessionRules | null;
  items: AuctionItem[];
};

export type CreateSessionResult = {
  sessionId: string;
  status: 'DRAFT';
};

export type PutRulesResult = {
  sessionId: string;
  version: number;
};

export type ScheduleSessionResult = {
  sessionId: string;
  status: 'SCHEDULED';
  startTime: number;
};

export type CreateItemResult = {
  itemId: string;
  status: 'WAITING';
  version: number;
};

const SESSION_STATUSES = new Set<SessionStatus>([
  'DRAFT',
  'SCHEDULED',
  'LIVE',
  'COMPLETED',
  'CANCELLED',
]);
const ITEM_STATUSES = new Set<ItemStatus>([
  'WAITING',
  'LIVE',
  'PAUSED',
  'PENDING_ADMIN_APPROVAL',
  'SOLD',
  'UNSOLD',
  'CANCELLED',
]);
const BID_STATUSES = new Set<BidStatus>(['ACCEPTED', 'REJECTED']);

function invalidData(): ServerlessApiError {
  return new ServerlessApiError(
    502,
    'INVALID_RESPONSE_DATA',
    'The server returned invalid catalog data.',
  );
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalidData();
  }
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value !== 'string') throw invalidData();
  return value;
}

function nonEmptyText(value: unknown): string {
  const result = text(value);
  if (!result.trim()) throw invalidData();
  return result;
}

function number(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw invalidData();
  return value;
}

function integer(value: unknown): number {
  const result = number(value);
  if (!Number.isInteger(result)) throw invalidData();
  return result;
}

function optionalText(value: unknown): string | undefined {
  return value === undefined ? undefined : text(value);
}

function optionalNumber(value: unknown): number | undefined {
  return value === undefined ? undefined : number(value);
}

function enumValue<T extends string>(value: unknown, allowed: Set<T>): T {
  if (typeof value !== 'string' || !allowed.has(value as T)) throw invalidData();
  return value as T;
}

export function mapSession(value: unknown): AuctionSession {
  const dto = record(value);
  const result: AuctionSession = {
    id: text(dto.session_id),
    title: text(dto.title),
    description: text(dto.description),
    status: enumValue(dto.status, SESSION_STATUSES),
    itemCount: integer(dto.item_count),
    createdAt: integer(dto.created_at),
    updatedAt: integer(dto.updated_at),
  };
  const startTime = optionalNumber(dto.start_time);
  const activeItemId = optionalText(dto.active_item_id);
  const currentSequence = optionalNumber(dto.current_sequence);
  const sellerSub = optionalText(dto.seller_sub);
  const version = optionalNumber(dto.version);
  if (startTime !== undefined) result.startTime = startTime;
  if (activeItemId !== undefined) result.activeItemId = activeItemId;
  if (currentSequence !== undefined) result.currentSequence = currentSequence;
  if (sellerSub !== undefined) result.sellerSub = sellerSub;
  if (version !== undefined) result.version = version;
  return result;
}

function mapRules(value: unknown): SessionRules {
  const dto = record(value);
  return {
    minIncrement: text(dto.min_increment),
    maxIncrement: text(dto.max_increment),
    antiSnipeWindowSeconds: integer(dto.anti_snipe_window_s),
    antiSnipeExtendSeconds: integer(dto.anti_snipe_extend_s),
    maxExtensions: integer(dto.max_extensions),
    publicHistoryLimit: integer(dto.public_history_limit),
  };
}

function mapLiveSnapshot(value: unknown): LiveItemSnapshot {
  const dto = record(value);
  const result: LiveItemSnapshot = {
    status: enumValue(dto.status, new Set<'LIVE'>(['LIVE'])),
    currentPrice: text(dto.current_price),
    endTime: integer(dto.end_time),
    extensionCount: integer(dto.extension_count),
  };
  const remainingSeconds = optionalNumber(dto.remaining_seconds);
  const finalPrice = optionalText(dto.final_price);
  if (remainingSeconds !== undefined) result.remainingSeconds = remainingSeconds;
  if (finalPrice !== undefined) result.finalPrice = finalPrice;
  return result;
}

export function mapItem(value: unknown): AuctionItem {
  const dto = record(value);
  if (!Array.isArray(dto.image_keys) || dto.image_keys.some((key) => typeof key !== 'string')) {
    throw invalidData();
  }
  const status = enumValue(dto.status, ITEM_STATUSES);
  const result: AuctionItem = {
    id: text(dto.item_id),
    sessionId: text(dto.session_id),
    sequenceNumber: integer(dto.sequence_number),
    name: text(dto.name),
    description: text(dto.description),
    categoryId: dto.category_id === null ? null : text(dto.category_id),
    startPrice: text(dto.start_price),
    durationSeconds: integer(dto.duration_s),
    status,
    imageKeys: [...dto.image_keys] as string[],
    createdAt: integer(dto.created_at),
    updatedAt: integer(dto.updated_at),
  };
  const finalPrice = optionalText(dto.final_price);
  if (finalPrice !== undefined) result.finalPrice = finalPrice;
  if (status === 'LIVE') {
    if (dto.live === undefined) throw invalidData();
    result.live = mapLiveSnapshot(dto.live);
  } else if (dto.live !== undefined) {
    throw invalidData();
  }
  return result;
}

export function mapBid(value: unknown): BidHistoryItem {
  const dto = record(value);
  const result: BidHistoryItem = {
    itemId: text(dto.item_id),
    requestId: text(dto.request_id),
    amount: text(dto.amount),
    status: enumValue(dto.status, BID_STATUSES),
  };
  const sessionId = optionalText(dto.session_id);
  const reason = optionalText(dto.reason);
  const timestamp = optionalNumber(dto.timestamp);
  const createdAt = optionalNumber(dto.created_at);
  if (sessionId !== undefined) result.sessionId = sessionId;
  if (reason !== undefined) result.reason = reason;
  if (timestamp !== undefined) result.timestamp = timestamp;
  if (createdAt !== undefined) result.createdAt = createdAt;
  return result;
}

export function mapCursorPage<T>(
  value: unknown,
  mapper: (item: unknown) => T,
): CursorPage<T> {
  const dto = record(value);
  if (!Array.isArray(dto.items)) throw invalidData();
  if (dto.next_cursor !== null && typeof dto.next_cursor !== 'string') {
    throw invalidData();
  }
  return {
    items: dto.items.map(mapper),
    nextCursor: dto.next_cursor,
  };
}

export function mapSessionDetail(value: unknown): SessionDetail {
  const dto = record(value);
  if (!Array.isArray(dto.items)) throw invalidData();
  return {
    session: mapSession(dto.session),
    rules: dto.rules === null ? null : mapRules(dto.rules),
    items: dto.items.map(mapItem),
  };
}

export function mapCreateSessionResult(value: unknown): CreateSessionResult {
  const dto = record(value);
  return {
    sessionId: text(dto.session_id),
    status: enumValue(dto.status, new Set<'DRAFT'>(['DRAFT'])),
  };
}

export function mapPutRulesResult(value: unknown): PutRulesResult {
  const dto = record(value);
  return {
    sessionId: text(dto.session_id),
    version: integer(dto.version),
  };
}

export function mapScheduleSessionResult(value: unknown): ScheduleSessionResult {
  const dto = record(value);
  return {
    sessionId: text(dto.session_id),
    status: enumValue(dto.status, new Set<'SCHEDULED'>(['SCHEDULED'])),
    startTime: integer(dto.start_time),
  };
}

export function mapCreateItemResult(value: unknown): CreateItemResult {
  const dto = record(value);
  return {
    itemId: nonEmptyText(dto.item_id),
    status: enumValue(dto.status, new Set<'WAITING'>(['WAITING'])),
    version: integer(dto.version),
  };
}

export function mapPresignedPost(value: unknown): PresignedPost {
  const dto = record(value);
  const signedFields = record(dto.fields);
  const signedEntries = Object.entries(signedFields);
  if (signedEntries.length === 0) throw invalidData();
  const fields: Record<string, string> = {};
  for (const [name, fieldValue] of signedEntries) {
    if (!name.trim()) throw invalidData();
    fields[name] = text(fieldValue);
  }

  const url = nonEmptyText(dto.url);
  try {
    if (new URL(url).protocol !== 'https:') throw invalidData();
  } catch (error) {
    if (error instanceof ServerlessApiError) throw error;
    throw invalidData();
  }
  const expiresIn = integer(dto.expires_in);
  if (expiresIn <= 0) throw invalidData();
  const objectKey = nonEmptyText(dto.object_key);
  if (fields.key !== objectKey) throw invalidData();

  return {
    url,
    fields,
    objectKey,
    expiresIn,
  };
}
