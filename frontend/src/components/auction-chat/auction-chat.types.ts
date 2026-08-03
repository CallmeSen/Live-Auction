import type { ConnectionStatus } from '../../features/auction-items/services/auctionItemSocketClient';

export type UserChatTimelineEntry = {
  id: string;
  kind: 'USER_MESSAGE';
  itemId: string;
  timestamp: string;
  userId: string;
  senderName: string;
  content: string;
};

export type ViewerJoinedTimelineEntry = {
  id: string;
  kind: 'VIEWER_JOINED';
  itemId: string;
  timestamp: string;
  userId?: string;
  displayName: string;
  viewerCount: number;
};

export type ViewerLeftTimelineEntry = {
  id: string;
  kind: 'VIEWER_LEFT';
  itemId: string;
  timestamp: string;
  userId?: string;
  displayName: string;
  viewerCount: number;
};

export type ViewerCountTimelineEntry = {
  id: string;
  kind: 'VIEWER_COUNT_CHANGED';
  itemId: string;
  timestamp: string;
  viewerCount: number;
};

export type BidPlacedTimelineEntry = {
  id: string;
  kind: 'BID_PLACED';
  itemId: string;
  timestamp: string;
  bidderId?: string;
  bidderName: string;
  bidAmount: number;
  currentPrice: number;
};

export type AuctionStatusTimelineEntry = {
  id: string;
  kind: 'AUCTION_STARTED' | 'AUCTION_ENDED' | 'AUCTION_CANCELLED';
  itemId: string;
  timestamp: string;
  message: string;
};

export type ItemOutcomeTimelineEntry = {
  id: string;
  kind: 'ITEM_SOLD' | 'ITEM_UNSOLD';
  itemId: string;
  timestamp: string;
  message: string;
};

export type ConnectionTimelineEntry = {
  id: string;
  kind: 'CONNECTION_LOST' | 'CONNECTION_RESTORED';
  itemId: string;
  timestamp: string;
  message: string;
};

export type SystemErrorTimelineEntry = {
  id: string;
  kind: 'SYSTEM_ERROR';
  itemId: string;
  timestamp: string;
  code?: string;
  message: string;
};

export type AuctionChatTimelineEntry =
  | UserChatTimelineEntry
  | ViewerJoinedTimelineEntry
  | ViewerLeftTimelineEntry
  | ViewerCountTimelineEntry
  | BidPlacedTimelineEntry
  | AuctionStatusTimelineEntry
  | ItemOutcomeTimelineEntry
  | ConnectionTimelineEntry
  | SystemErrorTimelineEntry;

export type ConnectionStatusLabel =
  | 'Connecting'
  | 'Connected'
  | 'Disconnected'
  | 'Reconnecting';

export const MAX_CHAT_MESSAGE_LENGTH = 500;

export const MAX_TIMELINE_ENTRIES = 500;

export const connectionStatusLabels: Record<
  ConnectionStatus,
  ConnectionStatusLabel
> = {
  connecting: 'Connecting',
  connected: 'Connected',
  disconnected: 'Disconnected',
  reconnecting: 'Reconnecting',
};

export function getConnectionStatusLabel(
  status: ConnectionStatus,
): ConnectionStatusLabel {
  return connectionStatusLabels[status];
}

export function isUserTimelineEntry(
  entry: AuctionChatTimelineEntry,
): entry is UserChatTimelineEntry {
  return entry.kind === 'USER_MESSAGE';
}

export function isSystemTimelineEntry(
  entry: AuctionChatTimelineEntry,
): entry is Exclude<AuctionChatTimelineEntry, UserChatTimelineEntry> {
  return entry.kind !== 'USER_MESSAGE';
}

/** @deprecated Use AuctionChatTimelineEntry with kind USER_MESSAGE */
export type ChatMessage = UserChatTimelineEntry;
