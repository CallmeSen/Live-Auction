import { useCallback, useEffect, useRef, useState } from 'react';
import {
  appendTimelineEntry,
  createConnectionTimelineEntry,
  createSystemErrorTimelineEntry,
  createTimelineEntryFromWebSocketEvent,
  updateViewerCount,
} from '../../../components/auction-chat/auctionChatTimeline';
import type { AuctionChatTimelineEntry } from '../../../components/auction-chat/auction-chat.types';
import { getToken } from '../../../utils/token';
import {
  AuctionItemSocketClient,
  getOrCreateClientSessionId,
  type ConnectionStatus,
} from '../services/auctionItemSocketClient';
import {
  applyBidPlacedToState,
  applySnapshotToState,
  type AuctionItemRealtimeState,
} from './auctionItemRealtimeState';

export type UseAuctionItemWebSocketResult = Omit<
  AuctionItemRealtimeState,
  'isConnected'
> & {
  isConnected: boolean;
  sendChatMessage: (content: string) => boolean;
  clearLastError: () => void;
  /** @deprecated Use timelineEntries */
  messages: Extract<AuctionChatTimelineEntry, { kind: 'USER_MESSAGE' }>[];
  /** @deprecated Use lastError */
  chatError: string | null;
  /** @deprecated Use clearLastError */
  clearChatError: () => void;
};

const initialState: AuctionItemRealtimeState = {
  viewerCount: 0,
  isConnected: false,
  connectionStatus: 'disconnected',
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

const USER_FACING_ERROR_CODES = new Set([
  'INVALID_CHAT_MESSAGE',
  'MESSAGE_TOO_LONG',
  'UNAUTHORIZED',
  'INVALID_MESSAGE',
]);

function useAuctionItemWebSocket(
  itemId: string | undefined,
): UseAuctionItemWebSocketResult {
  const [state, setState] =
    useState<AuctionItemRealtimeState>(initialState);

  const clientRef = useRef<AuctionItemSocketClient | null>(null);
  const connectionLostAppendedRef = useRef(false);
  const hadConnectedRef = useRef(false);
  const awaitingReconnectRestoreRef = useRef(false);

  useEffect(() => {
    if (!itemId) {
      // Reset the local snapshot before the next item connection is created.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState(initialState);
      return;
    }

    connectionLostAppendedRef.current = false;
    hadConnectedRef.current = false;
    awaitingReconnectRestoreRef.current = false;

    setState({
      ...initialState,
      connectionStatus: 'connecting',
    });

    const client = new AuctionItemSocketClient();
    clientRef.current = client;

    const appendTimeline = (entry: AuctionChatTimelineEntry) => {
      setState((previous) => ({
        ...previous,
        timelineEntries: appendTimelineEntry(previous.timelineEntries, entry),
      }));
    };

    client.connect(
      itemId,
      {
        onOpen: () => {
          setState((previous) => ({
            ...previous,
            isConnected: true,
            connectionStatus: 'connected',
            lastError: null,
          }));

          if (awaitingReconnectRestoreRef.current) {
            appendTimeline(
              createConnectionTimelineEntry(itemId, 'CONNECTION_RESTORED'),
            );
            awaitingReconnectRestoreRef.current = false;
          }

          connectionLostAppendedRef.current = false;
          hadConnectedRef.current = true;
        },
        onClose: () => {
          setState((previous) => ({
            ...previous,
            isConnected: false,
          }));

          if (hadConnectedRef.current && !connectionLostAppendedRef.current) {
            appendTimeline(
              createConnectionTimelineEntry(itemId, 'CONNECTION_LOST'),
            );
            connectionLostAppendedRef.current = true;
            awaitingReconnectRestoreRef.current = true;
          }
        },
        onConnectionStatusChange: (connectionStatus: ConnectionStatus) => {
          setState((previous) => ({
            ...previous,
            connectionStatus,
            isConnected: connectionStatus === 'connected',
          }));
        },
        onViewerCountUpdated: (viewerCount) => {
          setState((previous) => ({
            ...previous,
            viewerCount: updateViewerCount(previous.viewerCount, viewerCount),
          }));
        },
        onAuctionItemSnapshot: (event) => {
          setState((previous) => applySnapshotToState(previous, event));
        },
        onBidPlaced: (event) => {
          setState((previous) => applyBidPlacedToState(previous, event));
        },
        onTimelineEvent: (event) => {
          const timelineEntry = createTimelineEntryFromWebSocketEvent(event);

          if (!timelineEntry) {
            return;
          }

          appendTimeline(timelineEntry);
        },
        onErrorEvent: (event) => {
          if (!USER_FACING_ERROR_CODES.has(event.data.code)) {
            return;
          }

          const errorEntry = createSystemErrorTimelineEntry(itemId, event);

          setState((previous) => ({
            ...previous,
            lastError: event.data.message,
            timelineEntries: appendTimelineEntry(
              previous.timelineEntries,
              errorEntry,
            ),
          }));
        },
      },
      {
        accessToken: getToken(),
        clientSessionId: getOrCreateClientSessionId(itemId),
      },
    );

    return () => {
      client.disconnect();
      clientRef.current = null;
    };
  }, [itemId]);

  const sendChatMessage = useCallback((content: string) => {
    return clientRef.current?.sendChatMessage(content) ?? false;
  }, []);

  const clearLastError = useCallback(() => {
    setState((previous) => ({
      ...previous,
      lastError: null,
    }));
  }, []);

  const messages = state.timelineEntries.filter(
    (entry): entry is Extract<AuctionChatTimelineEntry, { kind: 'USER_MESSAGE' }> =>
      entry.kind === 'USER_MESSAGE',
  );

  return {
    ...state,
    isConnected: state.connectionStatus === 'connected',
    sendChatMessage,
    clearLastError,
    messages,
    chatError: state.lastError,
    clearChatError: clearLastError,
  };
}

export default useAuctionItemWebSocket;

export { useAuctionItemWebSocket as useAuctionItemRealtime };

export type { AuctionChatTimelineEntry };
