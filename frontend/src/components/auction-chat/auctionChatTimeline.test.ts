import { describe, expect, it } from 'vitest';
import {
  appendTimelineEntry,
  createConnectionTimelineEntry,
  createTimelineEntryFromWebSocketEvent,
  getTimelineEntryText,
} from './auctionChatTimeline';
import { AUCTION_ITEM_EVENT_TYPES } from '../../features/auction-items/services/auctionItemSocketClient';

describe('auctionChatTimeline', () => {
  it('maps VIEWER_JOINED to a system timeline entry', () => {
    const entry = createTimelineEntryFromWebSocketEvent({
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

    expect(entry?.kind).toBe('VIEWER_JOINED');
    expect(getTimelineEntryText(entry!)).toContain('Nguyen Van A joined the auction.');
    expect(getTimelineEntryText(entry!)).toContain('2 people are now watching.');
  });

  it('maps BID_PLACED to a system timeline entry', () => {
    const entry = createTimelineEntryFromWebSocketEvent({
      type: AUCTION_ITEM_EVENT_TYPES.BID_PLACED,
      eventId: 'event-2',
      itemId: 'item-123',
      timestamp: '2026-08-04T10:06:00.000Z',
      data: {
        bidId: 'bid-1',
        amount: '25000000',
        currentPrice: '25000000',
        placedAt: '2026-08-04T10:06:00Z',
        bidderName: 'Tran Van B',
      },
    });

    expect(entry?.kind).toBe('BID_PLACED');
    expect(getTimelineEntryText(entry!)).toContain('Tran Van B placed a bid of');
  });

  it('deduplicates timeline entries by id', () => {
    const first = appendTimelineEntry([], {
      id: 'entry-1',
      kind: 'AUCTION_STARTED',
      itemId: 'item-123',
      timestamp: '2026-08-04T10:10:00.000Z',
      message: 'The auction has started.',
    });

    const second = appendTimelineEntry(first, {
      id: 'entry-1',
      kind: 'AUCTION_STARTED',
      itemId: 'item-123',
      timestamp: '2026-08-04T10:10:00.000Z',
      message: 'The auction has started.',
    });

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(second).toBe(first);
  });

  it('limits timeline size to 500 entries', () => {
    const initial = Array.from({ length: 500 }, (_, index) => ({
      id: `entry-${index}`,
      kind: 'AUCTION_STARTED' as const,
      itemId: 'item-123',
      timestamp: '2026-08-04T10:10:00.000Z',
      message: 'The auction has started.',
    }));

    const next = appendTimelineEntry(initial, {
      id: 'entry-500',
      kind: 'AUCTION_STARTED',
      itemId: 'item-123',
      timestamp: '2026-08-04T10:11:00.000Z',
      message: 'The auction has started.',
    });

    expect(next).toHaveLength(500);
    expect(next[0]?.id).toBe('entry-1');
    expect(next.at(-1)?.id).toBe('entry-500');
  });

  it('creates local connection timeline entries', () => {
    const lost = createConnectionTimelineEntry('item-123', 'CONNECTION_LOST');

    expect(lost.kind).toBe('CONNECTION_LOST');
    expect(getTimelineEntryText(lost)).toBe(
      'Connection lost. Trying to reconnect...',
    );
  });
});
