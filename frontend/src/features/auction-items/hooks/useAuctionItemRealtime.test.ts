import { describe, expect, it } from 'vitest';
import { AUCTION_ITEM_EVENT_TYPES } from '../services/auctionItemSocketClient';
import {
  applyBidPlacedToState,
  applySnapshotToState,
} from './auctionItemRealtimeState';

describe('auction item realtime state helpers', () => {
  const baseState = {
    viewerCount: 1,
    isConnected: true,
    connectionStatus: 'connected' as const,
    status: null,
    currentPrice: null,
    startingPrice: null,
    minIncrement: null,
    openedAt: null,
    closedAt: null,
    latestBid: null,
    timelineEntries: [],
    lastError: null,
  };

  it('AUCTION_ITEM_SNAPSHOT replaces realtime state', () => {
    const next = applySnapshotToState(baseState, {
      type: AUCTION_ITEM_EVENT_TYPES.AUCTION_ITEM_SNAPSHOT,
      itemId: 'item-123',
      timestamp: '2026-08-04T09:00:00.000Z',
      data: {
        status: 'UNSOLD',
        currentPrice: '51000000.00',
        startingPrice: '50000000.00',
        minIncrement: '1000000.00',
        openedAt: null,
        closedAt: null,
      },
    });

    expect(next.currentPrice).toBe('51000000.00');
    expect(next.startingPrice).toBe('50000000.00');
    expect(next.latestBid).toBeNull();
    expect(next.timelineEntries).toEqual([]);
  });

  it('BID_PLACED updates currentPrice and latestBid', () => {
    const snapshotState = applySnapshotToState(baseState, {
      type: AUCTION_ITEM_EVENT_TYPES.AUCTION_ITEM_SNAPSHOT,
      itemId: 'item-123',
      timestamp: '2026-08-04T09:00:00.000Z',
      data: {
        status: 'UNSOLD',
        currentPrice: '51000000.00',
        startingPrice: '50000000.00',
        minIncrement: '1000000.00',
        openedAt: null,
        closedAt: null,
      },
    });

    const next = applyBidPlacedToState(snapshotState, {
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

    expect(next.currentPrice).toBe('52000000.00');
    expect(next.latestBid?.bidId).toBe('bid-1');
  });
});
