import { useEffect, useRef, useState } from 'react';
import { runtimeConfig } from '../../config/runtime';
import useAuth from '../../hooks/useAuth';
import {
  AuctionSocket,
  type SocketFactory,
  type SocketState,
} from '../../realtime/AuctionSocket';
import { placeBid, type AuctionEvent } from '../../realtime/protocol';
import type { CatalogApi } from '../../services/serverless/catalogApi';
import type { AuctionItem } from '../../services/serverless/mappers';
import { useCatalogApi } from '../../services/serverless/useCatalogApi';

export type ConnectionState =
  | 'loading'
  | 'connecting'
  | 'joined'
  | 'reconnecting'
  | 'offline'
  | 'failed'
  | 'closed';

type UseAuctionRoomOptions = {
  itemId: string;
  catalogApi?: CatalogApi;
  getIdToken?: () => Promise<string>;
  websocketUrl?: string;
  socketFactory?: SocketFactory;
  joinDelayMs?: number;
  joinTimeoutMs?: number;
  jitter?: () => number;
  isOnline?: () => boolean;
};

type UseAuctionRoomResult = {
  connectionState: ConnectionState;
  item: AuctionItem | null;
  currentPrice: string | null;
  endTime: number | null;
  highestBidderAlias: string | null;
  bidderAlias: string | null;
  extensionCount: number;
  lastEvent: AuctionEvent | null;
  retry(): void;
  sendBid(amount: string, requestId: string): boolean;
};

type ActiveSocket = {
  socket: AuctionSocket;
  itemId: string;
  intentional: boolean;
};

const RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 10_000] as const;
const MAX_JITTER_MS = 250;
const JOIN_DISPATCH_DELAY_MS = 500;
const JOIN_TIMEOUT_MS = 2_000;
const defaultJitter = () => Math.random() * (MAX_JITTER_MS + 1);
const defaultIsOnline = () => navigator.onLine;

function boundedJitter(jitter: () => number): number {
  const value = jitter();
  return Number.isFinite(value)
    ? Math.min(MAX_JITTER_MS, Math.max(0, Math.floor(value)))
    : 0;
}

export function useAuctionRoom(options: UseAuctionRoomOptions): UseAuctionRoomResult {
  const auth = useAuth();
  const api = useCatalogApi(options.catalogApi);
  const getIdToken = options.getIdToken ?? auth.getIdToken;
  const websocketUrl = options.websocketUrl ?? runtimeConfig.websocketUrl;
  const joinDelayMs = options.joinDelayMs ?? JOIN_DISPATCH_DELAY_MS;
  const joinTimeoutMs = options.joinTimeoutMs ?? JOIN_TIMEOUT_MS;
  const jitter = options.jitter ?? defaultJitter;
  const isOnline = options.isOnline ?? defaultIsOnline;
  const activeRef = useRef<ActiveSocket | null>(null);
  const retryRef = useRef<() => void>(() => undefined);
  const [connectionState, setConnectionState] = useState<ConnectionState>('loading');
  const [item, setItem] = useState<AuctionItem | null>(null);
  const [currentPrice, setCurrentPrice] = useState<string | null>(null);
  const [endTime, setEndTime] = useState<number | null>(null);
  const [highestBidderAlias, setHighestBidderAlias] = useState<string | null>(null);
  const [bidderAlias, setBidderAlias] = useState<string | null>(null);
  const [extensionCount, setExtensionCount] = useState(0);
  const [lastEvent, setLastEvent] = useState<AuctionEvent | null>(null);

  useEffect(() => {
    let disposed = false;
    let runGeneration = 0;
    let retryCount = 0;
    let retryLocked = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const currentRun = (generation: number): boolean => (
      !disposed && generation === runGeneration
    );

    const clearRetryTimer = () => {
      if (retryTimer !== null) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    };

    const stopActiveSocket = () => {
      const active = activeRef.current;
      if (!active) return;
      active.intentional = true;
      active.socket.close();
      if (activeRef.current === active) activeRef.current = null;
    };

    const applySnapshot = (snapshot: AuctionItem) => {
      setItem(snapshot);
      setCurrentPrice(snapshot.live?.currentPrice ?? snapshot.finalPrice ?? snapshot.startPrice);
      setEndTime(snapshot.live?.endTime ?? null);
      setExtensionCount(snapshot.live?.extensionCount ?? 0);
      setHighestBidderAlias(null);
      setBidderAlias(null);
      setLastEvent(null);
    };

    const applyEvent = (event: AuctionEvent) => {
      if (event.item_id !== options.itemId) return;
      setLastEvent(event);
      if (event.type === 'room_joined') {
        setBidderAlias(event.bidder_alias);
      } else if (event.type === 'price_update') {
        setCurrentPrice(event.current_price);
        if (event.end_time !== undefined) setEndTime(event.end_time);
        if (event.extension_count !== undefined) setExtensionCount(event.extension_count);
        if (event.highest_bidder_alias !== undefined) {
          setHighestBidderAlias(event.highest_bidder_alias);
        }
      } else if (event.type === 'bid_result') {
        if (event.current_price !== undefined) setCurrentPrice(event.current_price);
        if (event.end_time !== undefined) setEndTime(event.end_time);
        if (event.highest_bidder_alias !== undefined) {
          setHighestBidderAlias(event.highest_bidder_alias);
        }
      }
    };

    const scheduleReconnect = () => {
      if (disposed) return;
      clearRetryTimer();
      if (retryCount >= RETRY_DELAYS_MS.length) {
        retryLocked = true;
        setConnectionState('failed');
        return;
      }
      if (!isOnline()) {
        setConnectionState('offline');
        return;
      }
      const delay = RETRY_DELAYS_MS[retryCount] + boundedJitter(jitter);
      retryCount += 1;
      setConnectionState('reconnecting');
      retryTimer = setTimeout(() => {
        retryTimer = null;
        void startConnection(true);
      }, delay);
    };

    async function startConnection(reconnecting: boolean) {
      const generation = ++runGeneration;
      clearRetryTimer();
      if (!isOnline()) {
        if (currentRun(generation)) setConnectionState('offline');
        return;
      }
      setConnectionState(reconnecting ? 'reconnecting' : 'loading');

      try {
        const snapshot = await api.getItem(options.itemId);
        if (!currentRun(generation)) return;
        applySnapshot(snapshot);
        if (snapshot.status !== 'LIVE' || !snapshot.live) {
          setConnectionState('closed');
          return;
        }
        if (!isOnline()) {
          setConnectionState('offline');
          return;
        }

        setConnectionState(reconnecting ? 'reconnecting' : 'connecting');
        const token = await getIdToken();
        if (!currentRun(generation)) return;
        if (!isOnline()) {
          setConnectionState('offline');
          return;
        }

        const socket = new AuctionSocket({
          url: websocketUrl,
          itemId: options.itemId,
          joinDelayMs,
          joinTimeoutMs,
          factory: options.socketFactory,
          onEvent: (event) => {
            if (!currentRun(generation)) return;
            applyEvent(event);
          },
          onState: (state: SocketState) => {
            const active = activeRef.current;
            if (!currentRun(generation) || active?.socket !== socket) return;
            if (state === 'joined') {
              retryCount = 0;
              retryLocked = false;
              setConnectionState('joined');
            } else if (state === 'error') {
              if (!active.intentional) {
                stopActiveSocket();
                scheduleReconnect();
              }
            } else if (state === 'closed') {
              activeRef.current = null;
              if (!active.intentional) scheduleReconnect();
            }
          },
        });
        activeRef.current = { socket, itemId: options.itemId, intentional: false };
        socket.connect(token);
      } catch {
        if (!currentRun(generation)) return;
        stopActiveSocket();
        if (retryTimer === null && !retryLocked) scheduleReconnect();
      }
    }

    const retry = () => {
      if (disposed) return;
      runGeneration += 1;
      retryCount = 0;
      retryLocked = false;
      clearRetryTimer();
      stopActiveSocket();
      void startConnection(true);
    };
    retryRef.current = retry;

    const handleOffline = () => {
      if (disposed) return;
      if (retryLocked) {
        setConnectionState('failed');
        return;
      }
      runGeneration += 1;
      clearRetryTimer();
      stopActiveSocket();
      setConnectionState('offline');
    };
    const handleOnline = () => {
      if (disposed || !isOnline()) return;
      if (retryLocked) {
        setConnectionState('failed');
        return;
      }
      runGeneration += 1;
      clearRetryTimer();
      stopActiveSocket();
      void startConnection(true);
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    void startConnection(false);

    return () => {
      disposed = true;
      runGeneration += 1;
      clearRetryTimer();
      stopActiveSocket();
      retryRef.current = () => undefined;
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [
    api,
    getIdToken,
    isOnline,
    jitter,
    joinDelayMs,
    joinTimeoutMs,
    options.itemId,
    options.socketFactory,
    websocketUrl,
  ]);

  const hasCurrentItem = item?.id === options.itemId;

  return {
    connectionState,
    item: hasCurrentItem ? item : null,
    currentPrice: hasCurrentItem ? currentPrice : null,
    endTime: hasCurrentItem ? endTime : null,
    highestBidderAlias: hasCurrentItem ? highestBidderAlias : null,
    bidderAlias: hasCurrentItem ? bidderAlias : null,
    extensionCount: hasCurrentItem ? extensionCount : 0,
    lastEvent: hasCurrentItem ? lastEvent : null,
    retry: () => retryRef.current(),
    sendBid: (amount, requestId) => {
      const active = activeRef.current;
      if (!active || active.itemId !== options.itemId) return false;
      return active.socket.send(placeBid(options.itemId, amount, requestId));
    },
  };
}
