import { describe, expect, it } from 'vitest';
import {
  joinRoom,
  parseAuctionEvent,
  placeBid,
  type AuctionEvent,
} from './protocol';

const itemId = 'item-1';

describe('realtime protocol', () => {
  it('builds the exact outbound commands', () => {
    expect(joinRoom(itemId)).toEqual({ action: 'joinRoom', item_id: itemId });
    expect(placeBid(itemId, '101.25', 'request-123')).toEqual({
      action: 'placeBid',
      item_id: itemId,
      amount: '101.25',
      request_id: 'request-123',
    });
  });

  it.each<[string, AuctionEvent]>([
    [
      JSON.stringify({
        type: 'room_joined',
        item_id: itemId,
        bidder_alias: 'Bidder #12',
      }),
      { type: 'room_joined', item_id: itemId, bidder_alias: 'Bidder #12' },
    ],
    [
      JSON.stringify({
        type: 'bid_queued',
        item_id: itemId,
        request_id: 'request-123',
      }),
      { type: 'bid_queued', item_id: itemId, request_id: 'request-123' },
    ],
    [
      JSON.stringify({
        type: 'price_update',
        item_id: itemId,
        status: 'ACCEPTED',
        request_id: 'request-123',
        current_price: '101.25',
        highest_bidder_alias: 'Bidder #12',
        end_time: 1_800_000_000,
        extension_count: 1,
      }),
      {
        type: 'price_update',
        item_id: itemId,
        status: 'ACCEPTED',
        request_id: 'request-123',
        current_price: '101.25',
        highest_bidder_alias: 'Bidder #12',
        end_time: 1_800_000_000,
        extension_count: 1,
      },
    ],
    [
      JSON.stringify({
        type: 'bid_result',
        item_id: itemId,
        status: 'REJECTED',
        reason: 'REJECTED_LOW_INCREMENT',
        request_id: 'request-123',
        current_price: '101.25',
      }),
      {
        type: 'bid_result',
        item_id: itemId,
        status: 'REJECTED',
        reason: 'REJECTED_LOW_INCREMENT',
        request_id: 'request-123',
        current_price: '101.25',
      },
    ],
  ])('parses an approved event without changing its fields', (raw, event) => {
    expect(parseAuctionEvent(raw, itemId)).toEqual({ ok: true, event });
  });

  it.each(['101.123', '1E+2', '1E-7'])('accepts a finite backend Decimal string: %s', (price) => {
    expect(parseAuctionEvent(JSON.stringify({
      type: 'price_update',
      item_id: itemId,
      status: 'ACCEPTED',
      request_id: 'request-123',
      current_price: price,
    }), itemId)).toEqual({
      ok: true,
      event: {
        type: 'price_update',
        item_id: itemId,
        status: 'ACCEPTED',
        request_id: 'request-123',
        current_price: price,
      },
    });
  });

  it.each([
    ['{not-json', 'MALFORMED_MESSAGE'],
    [JSON.stringify({ type: 'unknown', item_id: itemId }), 'UNKNOWN_EVENT'],
    [JSON.stringify({ type: 'bid_queued', item_id: 'item-2', request_id: 'request-123' }), 'WRONG_ITEM'],
    [JSON.stringify({
      type: 'price_update',
      item_id: itemId,
      status: 'ACCEPTED',
      request_id: 'request-123',
      current_price: '101',
      extension_count: -1,
    }), 'INVALID_EVENT'],
    [JSON.stringify({
      type: 'price_update',
      item_id: itemId,
      status: 'ACCEPTED',
      request_id: 'request-123',
      current_price: 'NaN',
    }), 'INVALID_EVENT'],
    [JSON.stringify({
      type: 'price_update',
      item_id: itemId,
      status: 'ACCEPTED',
      current_price: '101',
    }), 'INVALID_EVENT'],
    [JSON.stringify({
      type: 'room_joined',
      item_id: itemId,
      bidder_alias: 'Bidder #12',
      token: 'secret-token',
    }), 'INVALID_EVENT'],
  ])('returns a typed failure instead of throwing: %#', (raw, reason) => {
    expect(() => parseAuctionEvent(raw, itemId)).not.toThrow();
    expect(parseAuctionEvent(raw, itemId)).toEqual({ ok: false, reason });
  });
});
