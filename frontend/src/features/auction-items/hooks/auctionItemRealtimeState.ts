import type { ConnectionStatus } from '../services/auctionItemSocketClient';
import type {
  AuctionItemSnapshotEvent,
  BidPlacedEvent,
} from '../services/auctionItemSocketClient';
import type { AuctionChatTimelineEntry } from '../../../components/auction-chat/auction-chat.types';

export type AuctionItemRealtimeState = {
  viewerCount: number;
  isConnected: boolean;
  connectionStatus: ConnectionStatus;
  status: string | null;
  currentPrice: string | null;
  startingPrice: string | null;
  minIncrement: string | null;
  openedAt: string | null;
  closedAt: string | null;
  latestBid: {
    bidId: string;
    amount: string;
    placedAt: string;
  } | null;
  timelineEntries: AuctionChatTimelineEntry[];
  lastError: string | null;
};

export function applySnapshotToState(
  previous: AuctionItemRealtimeState,
  event: AuctionItemSnapshotEvent,
): AuctionItemRealtimeState {
  return {
    ...previous,
    status: event.data.status,
    currentPrice: event.data.currentPrice,
    startingPrice: event.data.startingPrice,
    minIncrement: event.data.minIncrement,
    openedAt: event.data.openedAt,
    closedAt: event.data.closedAt,
    latestBid: null,
  };
}

export function applyBidPlacedToState(
  previous: AuctionItemRealtimeState,
  event: BidPlacedEvent,
): AuctionItemRealtimeState {
  return {
    ...previous,
    currentPrice: event.data.currentPrice,
    latestBid: {
      bidId: event.data.bidId,
      amount: event.data.amount,
      placedAt: event.data.placedAt,
    },
  };
}
