import { formatCurrency } from '../../utils/formatCurrency';
import type {
  AuctionChatTimelineEntry,
  ConnectionTimelineEntry,
  SystemErrorTimelineEntry,
  UserChatTimelineEntry,
} from './auction-chat.types';
import type {
  AuctionItemSocketEvent,
  AuctionWebSocketErrorEvent,
  ChatMessageSentEvent,
} from '../../features/auction-items/services/auctionItemSocketClient';

export const MAX_TIMELINE_ENTRIES = 500;

function viewerCountText(viewerCount: number): string {
  return viewerCount === 1
    ? '1 person is now watching.'
    : `${viewerCount} people are now watching.`;
}

export function getTimelineEntryText(
  entry: AuctionChatTimelineEntry,
): string {
  switch (entry.kind) {
    case 'USER_MESSAGE':
      return entry.content;

    case 'VIEWER_JOINED':
      return `${entry.displayName} joined the auction.\n${viewerCountText(entry.viewerCount)}`;

    case 'VIEWER_LEFT':
      return `${entry.displayName} left the auction.\n${viewerCountText(entry.viewerCount)}`;

    case 'VIEWER_COUNT_CHANGED':
      return viewerCountText(entry.viewerCount);

    case 'BID_PLACED':
      return `${entry.bidderName} placed a bid of ${formatCurrency(entry.bidAmount)}.`;

    case 'AUCTION_STARTED':
    case 'AUCTION_ENDED':
    case 'AUCTION_CANCELLED':
    case 'ITEM_SOLD':
    case 'ITEM_UNSOLD':
    case 'CONNECTION_LOST':
    case 'CONNECTION_RESTORED':
      return entry.message;

    case 'SYSTEM_ERROR':
      if (
        entry.code === 'INVALID_CHAT_MESSAGE' ||
        entry.code === 'MESSAGE_TOO_LONG'
      ) {
        return `Message could not be sent: ${entry.message}`;
      }

      return entry.message;

    default:
      return '';
  }
}

export function appendTimelineEntry(
  currentEntries: AuctionChatTimelineEntry[],
  incomingEntry: AuctionChatTimelineEntry,
  maxEntries: number = MAX_TIMELINE_ENTRIES,
): AuctionChatTimelineEntry[] {
  const alreadyExists = currentEntries.some(
    (entry) => entry.id === incomingEntry.id,
  );

  if (alreadyExists) {
    return currentEntries;
  }

  const nextEntries = [...currentEntries, incomingEntry];

  return nextEntries.length > maxEntries
    ? nextEntries.slice(-maxEntries)
    : nextEntries;
}

function parseEventId(
  payload: { eventId?: string },
  fallback: string,
): string {
  return typeof payload.eventId === 'string' ? payload.eventId : fallback;
}

function parseOptionalUserId(data: Record<string, unknown>): string | undefined {
  return typeof data.userId === 'string' ? data.userId : undefined;
}

export function createUserMessageTimelineEntry(
  event: ChatMessageSentEvent,
): UserChatTimelineEntry {
  return {
    id: event.data.messageId,
    kind: 'USER_MESSAGE',
    itemId: event.itemId,
    timestamp: event.timestamp,
    userId: event.data.userId,
    senderName: event.data.senderName,
    content: event.data.content,
  };
}

export function createTimelineEntryFromWebSocketEvent(
  event: AuctionItemSocketEvent,
): AuctionChatTimelineEntry | null {
  const base = {
    itemId: event.itemId,
    timestamp: event.timestamp,
  };

  switch (event.type) {
    case 'CHAT_MESSAGE_SENT':
      return createUserMessageTimelineEntry(event);

    case 'VIEWER_JOINED':
      return {
        id: parseEventId(event, `${event.data.connectionId}-joined`),
        kind: 'VIEWER_JOINED',
        ...base,
        userId: parseOptionalUserId(event.data as Record<string, unknown>),
        displayName: event.data.displayName,
        viewerCount: event.data.viewerCount,
      };

    case 'VIEWER_LEFT':
      return {
        id: parseEventId(event, `${event.data.connectionId}-left`),
        kind: 'VIEWER_LEFT',
        ...base,
        userId: parseOptionalUserId(event.data as Record<string, unknown>),
        displayName: event.data.displayName,
        viewerCount: event.data.viewerCount,
      };

    case 'BID_PLACED': {
      const bidderName = event.data.bidderName ?? 'A bidder';

      return {
        id: parseEventId(event, event.data.bidId),
        kind: 'BID_PLACED',
        ...base,
        bidderId: event.data.bidderId,
        bidderName,
        bidAmount: Number(event.data.amount),
        currentPrice: Number(event.data.currentPrice),
      };
    }

    case 'AUCTION_STARTED':
      return {
        id: parseEventId(event, `${event.itemId}-started-${event.timestamp}`),
        kind: 'AUCTION_STARTED',
        ...base,
        message: event.data.message,
      };

    case 'AUCTION_ENDED':
      return {
        id: parseEventId(event, `${event.itemId}-ended-${event.timestamp}`),
        kind: 'AUCTION_ENDED',
        ...base,
        message: event.data.message,
      };

    case 'AUCTION_CANCELLED':
      return {
        id: parseEventId(event, `${event.itemId}-cancelled-${event.timestamp}`),
        kind: 'AUCTION_CANCELLED',
        ...base,
        message: event.data.message,
      };

    case 'ITEM_SOLD':
      return {
        id: parseEventId(event, `${event.itemId}-sold-${event.timestamp}`),
        kind: 'ITEM_SOLD',
        ...base,
        message: `${event.data.winnerName} won the item for ${formatCurrency(Number(event.data.finalPrice))}.`,
      };

    case 'ITEM_UNSOLD':
      return {
        id: parseEventId(event, `${event.itemId}-unsold-${event.timestamp}`),
        kind: 'ITEM_UNSOLD',
        ...base,
        message: event.data.message,
      };

    default:
      return null;
  }
}

export function createSystemErrorTimelineEntry(
  itemId: string,
  event: AuctionWebSocketErrorEvent,
): SystemErrorTimelineEntry {
  return {
    id: crypto.randomUUID(),
    kind: 'SYSTEM_ERROR',
    itemId,
    timestamp: new Date().toISOString(),
    code: event.data.code,
    message: event.data.message,
  };
}

export function createConnectionTimelineEntry(
  itemId: string,
  kind: 'CONNECTION_LOST' | 'CONNECTION_RESTORED',
): ConnectionTimelineEntry {
  return {
    id: crypto.randomUUID(),
    kind,
    itemId,
    timestamp: new Date().toISOString(),
    message:
      kind === 'CONNECTION_LOST'
        ? 'Connection lost. Trying to reconnect...'
        : 'Connection restored.',
  };
}

export function updateViewerCount(
  currentCount: number,
  incomingCount: number,
): number {
  return currentCount === incomingCount ? currentCount : incomingCount;
}
