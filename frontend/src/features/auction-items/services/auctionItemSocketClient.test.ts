import { describe, expect, it } from 'vitest';
import {
  parseAuctionItemSocketEvent,
  AUCTION_ITEM_EVENT_TYPES,
} from '../services/auctionItemSocketClient';

describe('parseAuctionItemSocketEvent', () => {
  it('parses VIEWER_COUNT_UPDATED payloads', () => {
    const parsed = parseAuctionItemSocketEvent({
      type: AUCTION_ITEM_EVENT_TYPES.VIEWER_COUNT_UPDATED,
      itemId: 'item-123',
      timestamp: '2026-07-23T04:00:00.000Z',
      data: {
        viewerCount: 2,
      },
    });

    expect(parsed).toEqual({
      type: AUCTION_ITEM_EVENT_TYPES.VIEWER_COUNT_UPDATED,
      itemId: 'item-123',
      timestamp: '2026-07-23T04:00:00.000Z',
      data: { viewerCount: 2 },
    });
  });

  it('parses AUCTION_ITEM_SNAPSHOT payloads', () => {
    const parsed = parseAuctionItemSocketEvent({
      type: AUCTION_ITEM_EVENT_TYPES.AUCTION_ITEM_SNAPSHOT,
      itemId: 'item-123',
      timestamp: '2026-08-04T09:00:00.000Z',
      data: {
        status: 'UNSOLD',
        currentPrice: '51000000.00',
        startingPrice: '50000000.00',
        minIncrement: '1000000.00',
        openedAt: '2026-08-04T09:00:00Z',
        closedAt: null,
      },
    });

    expect(parsed?.type).toBe(
      AUCTION_ITEM_EVENT_TYPES.AUCTION_ITEM_SNAPSHOT,
    );

    if (parsed?.type !== AUCTION_ITEM_EVENT_TYPES.AUCTION_ITEM_SNAPSHOT) {
      throw new Error('Expected snapshot event');
    }

    expect(parsed.data.currentPrice).toBe('51000000.00');
    expect(parsed.data.startingPrice).toBe('50000000.00');
  });

  it('parses BID_PLACED payloads', () => {
    const parsed = parseAuctionItemSocketEvent({
      type: AUCTION_ITEM_EVENT_TYPES.BID_PLACED,
      itemId: 'item-123',
      timestamp: '2026-08-04T09:15:00.000Z',
      data: {
        bidId: 'bid-1',
        amount: '52000000.00',
        currentPrice: '52000000.00',
        placedAt: '2026-08-04T09:15:00Z',
      },
    });

    expect(parsed?.type).toBe(AUCTION_ITEM_EVENT_TYPES.BID_PLACED);

    if (parsed?.type !== AUCTION_ITEM_EVENT_TYPES.BID_PLACED) {
      throw new Error('Expected bid placed event');
    }

    expect(parsed.data.bidId).toBe('bid-1');
    expect(parsed.data.currentPrice).toBe('52000000.00');
  });

  it('parses VIEWER_JOINED payloads', () => {
    const parsed = parseAuctionItemSocketEvent({
      type: AUCTION_ITEM_EVENT_TYPES.VIEWER_JOINED,
      eventId: 'event-1',
      itemId: 'item-123',
      timestamp: '2026-08-04T10:00:00.000Z',
      data: {
        connectionId: 'conn-1',
        displayName: 'Nguyen Van A',
        viewerCount: 2,
      },
    });

    expect(parsed?.type).toBe(AUCTION_ITEM_EVENT_TYPES.VIEWER_JOINED);
  });

  it('parses CHAT_MESSAGE_SENT payloads', () => {
    const parsed = parseAuctionItemSocketEvent({
      type: AUCTION_ITEM_EVENT_TYPES.CHAT_MESSAGE_SENT,
      itemId: 'item-123',
      timestamp: '2026-08-04T10:01:00.000Z',
      data: {
        messageId: 'msg-1',
        userId: 'user-1',
        senderName: 'Nguyen Van A',
        content: 'Hello',
      },
    });

    expect(parsed?.type).toBe(AUCTION_ITEM_EVENT_TYPES.CHAT_MESSAGE_SENT);

    if (parsed?.type !== AUCTION_ITEM_EVENT_TYPES.CHAT_MESSAGE_SENT) {
      throw new Error('Expected chat message event');
    }

    expect(parsed.data.content).toBe('Hello');
    expect(parsed.data.senderName).toBe('Nguyen Van A');
  });

  it('returns null for invalid payloads', () => {
    expect(parseAuctionItemSocketEvent(null)).toBeNull();
    expect(parseAuctionItemSocketEvent({ type: 'OTHER' })).toBeNull();
    expect(
      parseAuctionItemSocketEvent({
        type: AUCTION_ITEM_EVENT_TYPES.BID_PLACED,
        itemId: 'item-123',
        timestamp: '2026-08-04T09:15:00.000Z',
        data: {},
      }),
    ).toBeNull();
  });
});
