export type RoomJoinedEvent = {
  type: 'room_joined';
  item_id: string;
  bidder_alias: string;
};

export type BidQueuedEvent = {
  type: 'bid_queued';
  item_id: string;
  request_id: string;
};

export type PriceUpdateEvent = {
  type: 'price_update';
  item_id: string;
  status: 'ACCEPTED';
  request_id: string;
  current_price: string;
  highest_bidder_alias?: string;
  end_time?: number;
  extension_count?: number;
};

export type BidResultEvent = {
  type: 'bid_result';
  item_id: string;
  status: 'REJECTED';
  reason: string;
  request_id: string;
  current_price?: string;
  highest_bidder_alias?: string;
  end_time?: number;
};

export type AuctionEvent =
  | RoomJoinedEvent
  | BidQueuedEvent
  | PriceUpdateEvent
  | BidResultEvent;

export type JoinRoomCommand = ReturnType<typeof joinRoom>;
export type PlaceBidCommand = ReturnType<typeof placeBid>;
export type AuctionCommand = JoinRoomCommand | PlaceBidCommand;

export type ProtocolFailureReason =
  | 'MALFORMED_MESSAGE'
  | 'UNKNOWN_EVENT'
  | 'WRONG_ITEM'
  | 'INVALID_EVENT';

export type ProtocolResult =
  | { ok: true; event: AuctionEvent }
  | { ok: false; reason: ProtocolFailureReason };

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

export const joinRoom = (itemId: string) => ({
  action: 'joinRoom' as const,
  item_id: itemId,
});

export const placeBid = (itemId: string, amount: string, requestId: string) => ({
  action: 'placeBid' as const,
  item_id: itemId,
  amount,
  request_id: requestId,
});

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function hasExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.prototype.hasOwnProperty.call(value, key))
    && Object.keys(value).every((key) => allowed.has(key));
}

function identifier(value: unknown, minimumLength = 1): value is string {
  return typeof value === 'string'
    && value.length >= minimumLength
    && IDENTIFIER_PATTERN.test(value);
}

function nonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function decimalString(value: unknown): value is string {
  return typeof value === 'string'
    && value.length <= 128
    && DECIMAL_PATTERN.test(value);
}

function parseRoomJoined(message: Record<string, unknown>): AuctionEvent | null {
  if (
    !hasExactKeys(message, ['type', 'item_id', 'bidder_alias'])
    || !nonEmptyText(message.bidder_alias)
  ) return null;
  return {
    type: 'room_joined',
    item_id: message.item_id as string,
    bidder_alias: message.bidder_alias,
  };
}

function parseBidQueued(message: Record<string, unknown>): AuctionEvent | null {
  if (
    !hasExactKeys(message, ['type', 'item_id', 'request_id'])
    || !identifier(message.request_id, 8)
  ) return null;
  return {
    type: 'bid_queued',
    item_id: message.item_id as string,
    request_id: message.request_id,
  };
}

function parsePriceUpdate(message: Record<string, unknown>): AuctionEvent | null {
  if (
    !hasExactKeys(
      message,
      ['type', 'item_id', 'status', 'request_id', 'current_price'],
      ['highest_bidder_alias', 'end_time', 'extension_count'],
    )
    || message.status !== 'ACCEPTED'
    || !identifier(message.request_id, 8)
    || !decimalString(message.current_price)
    || (
      message.highest_bidder_alias !== undefined
      && !nonEmptyText(message.highest_bidder_alias)
    )
    || (
      message.end_time !== undefined
      && (!Number.isInteger(message.end_time) || (message.end_time as number) <= 0)
    )
    || (
      message.extension_count !== undefined
      && (!Number.isInteger(message.extension_count) || (message.extension_count as number) < 0)
    )
  ) return null;
  return {
    type: 'price_update',
    item_id: message.item_id as string,
    status: 'ACCEPTED',
    request_id: message.request_id,
    current_price: message.current_price,
    ...(message.highest_bidder_alias === undefined
      ? {}
      : { highest_bidder_alias: message.highest_bidder_alias }),
    ...(message.end_time === undefined ? {} : { end_time: message.end_time as number }),
    ...(message.extension_count === undefined
      ? {}
      : { extension_count: message.extension_count as number }),
  };
}

function parseBidResult(message: Record<string, unknown>): AuctionEvent | null {
  if (
    !hasExactKeys(
      message,
      ['type', 'item_id', 'status', 'reason', 'request_id'],
      ['current_price', 'highest_bidder_alias', 'end_time'],
    )
    || message.status !== 'REJECTED'
    || !identifier(message.reason)
    || !identifier(message.request_id, 8)
    || (
      message.current_price !== undefined
      && !decimalString(message.current_price)
    )
    || (
      message.highest_bidder_alias !== undefined
      && !nonEmptyText(message.highest_bidder_alias)
    )
    || (
      message.end_time !== undefined
      && (!Number.isInteger(message.end_time) || (message.end_time as number) <= 0)
    )
  ) return null;
  return {
    type: 'bid_result',
    item_id: message.item_id as string,
    status: 'REJECTED',
    reason: message.reason,
    request_id: message.request_id,
    ...(message.current_price === undefined ? {} : { current_price: message.current_price }),
    ...(message.highest_bidder_alias === undefined
      ? {}
      : { highest_bidder_alias: message.highest_bidder_alias }),
    ...(message.end_time === undefined ? {} : { end_time: message.end_time as number }),
  };
}

export function parseAuctionEvent(raw: string, expectedItemId: string): ProtocolResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'MALFORMED_MESSAGE' };
  }

  const message = record(parsed);
  if (!message || typeof message.type !== 'string') {
    return { ok: false, reason: 'MALFORMED_MESSAGE' };
  }
  if (!['room_joined', 'bid_queued', 'price_update', 'bid_result'].includes(message.type)) {
    return { ok: false, reason: 'UNKNOWN_EVENT' };
  }
  if (!identifier(message.item_id)) {
    return { ok: false, reason: 'INVALID_EVENT' };
  }
  if (message.item_id !== expectedItemId) {
    return { ok: false, reason: 'WRONG_ITEM' };
  }

  const event = message.type === 'room_joined'
    ? parseRoomJoined(message)
    : message.type === 'bid_queued'
      ? parseBidQueued(message)
      : message.type === 'price_update'
        ? parsePriceUpdate(message)
        : parseBidResult(message);
  return event ? { ok: true, event } : { ok: false, reason: 'INVALID_EVENT' };
}
