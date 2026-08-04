export const AUCTION_ITEM_EVENT_TYPES = {
  VIEWER_COUNT_UPDATED: 'VIEWER_COUNT_UPDATED',
  VIEWER_JOINED: 'VIEWER_JOINED',
  VIEWER_LEFT: 'VIEWER_LEFT',
  AUCTION_ITEM_SNAPSHOT: 'AUCTION_ITEM_SNAPSHOT',
  BID_PLACED: 'BID_PLACED',
  CHAT_MESSAGE_SENT: 'CHAT_MESSAGE_SENT',
  AUCTION_STARTED: 'AUCTION_STARTED',
  AUCTION_ENDED: 'AUCTION_ENDED',
  AUCTION_CANCELLED: 'AUCTION_CANCELLED',
  ITEM_SOLD: 'ITEM_SOLD',
  ITEM_UNSOLD: 'ITEM_UNSOLD',
} as const;

export type AuctionItemEventType =
  (typeof AUCTION_ITEM_EVENT_TYPES)[keyof typeof AUCTION_ITEM_EVENT_TYPES];

export type ViewerCountUpdatedEvent = {
  type: typeof AUCTION_ITEM_EVENT_TYPES.VIEWER_COUNT_UPDATED;
  eventId?: string;
  itemId: string;
  timestamp: string;
  data: {
    viewerCount: number;
  };
};

export type ViewerJoinedEvent = {
  type: typeof AUCTION_ITEM_EVENT_TYPES.VIEWER_JOINED;
  eventId?: string;
  itemId: string;
  timestamp: string;
  data: {
    connectionId: string;
    userId?: string;
    displayName: string;
    viewerCount: number;
  };
};

export type ViewerLeftEvent = {
  type: typeof AUCTION_ITEM_EVENT_TYPES.VIEWER_LEFT;
  eventId?: string;
  itemId: string;
  timestamp: string;
  data: {
    connectionId: string;
    userId?: string;
    displayName: string;
    viewerCount: number;
  };
};

export type AuctionItemSnapshotEvent = {
  type: typeof AUCTION_ITEM_EVENT_TYPES.AUCTION_ITEM_SNAPSHOT;
  itemId: string;
  timestamp: string;
  data: {
    status: string;
    currentPrice: string;
    startingPrice: string;
    minIncrement: string;
    openedAt: string | null;
    closedAt: string | null;
  };
};

export type BidPlacedEvent = {
  type: typeof AUCTION_ITEM_EVENT_TYPES.BID_PLACED;
  eventId?: string;
  itemId: string;
  timestamp: string;
  data: {
    bidId: string;
    amount: string;
    currentPrice: string;
    placedAt: string;
    bidderId?: string;
    bidderName?: string;
  };
};

export type ChatMessageSentEvent = {
  type: typeof AUCTION_ITEM_EVENT_TYPES.CHAT_MESSAGE_SENT;
  itemId: string;
  timestamp: string;
  data: {
    messageId: string;
    userId: string;
    senderName: string;
    content: string;
  };
};

export type AuctionWebSocketErrorEvent = {
  type: 'ERROR';
  data: {
    code: string;
    message: string;
  };
};

export type AuctionLifecycleEvent = {
  type:
    | typeof AUCTION_ITEM_EVENT_TYPES.AUCTION_STARTED
    | typeof AUCTION_ITEM_EVENT_TYPES.AUCTION_ENDED
    | typeof AUCTION_ITEM_EVENT_TYPES.AUCTION_CANCELLED;
  eventId?: string;
  itemId: string;
  timestamp: string;
  data: {
    message: string;
  };
};

export type ItemSoldEvent = {
  type: typeof AUCTION_ITEM_EVENT_TYPES.ITEM_SOLD;
  eventId?: string;
  itemId: string;
  timestamp: string;
  data: {
    winnerUserId: string;
    winnerName: string;
    finalPrice: string;
  };
};

export type ItemUnsoldEvent = {
  type: typeof AUCTION_ITEM_EVENT_TYPES.ITEM_UNSOLD;
  eventId?: string;
  itemId: string;
  timestamp: string;
  data: {
    message: string;
  };
};

export type AuctionItemSocketEvent =
  | ViewerCountUpdatedEvent
  | ViewerJoinedEvent
  | ViewerLeftEvent
  | AuctionItemSnapshotEvent
  | BidPlacedEvent
  | ChatMessageSentEvent
  | AuctionLifecycleEvent
  | ItemSoldEvent
  | ItemUnsoldEvent;

export type ConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'reconnecting';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function parseBaseEvent(
  payload: unknown,
): {
  type: string;
  eventId?: string;
  itemId: string;
  timestamp: string;
  data: unknown;
} | null {
  if (!isRecord(payload)) {
    return null;
  }

  const { type, itemId, timestamp, data, eventId } = payload;

  if (typeof type !== 'string') {
    return null;
  }

  if (typeof itemId !== 'string') {
    return null;
  }

  if (typeof timestamp !== 'string') {
    return null;
  }

  return {
    type,
    eventId: typeof eventId === 'string' ? eventId : undefined,
    itemId,
    timestamp,
    data,
  };
}

function withEventId<T extends AuctionItemSocketEvent>(
  event: T,
  eventId: string | undefined,
): T {
  return eventId ? { ...event, eventId } : event;
}

export function parseAuctionWebSocketErrorEvent(
  payload: unknown,
): AuctionWebSocketErrorEvent | null {
  if (!isRecord(payload) || payload.type !== 'ERROR') {
    return null;
  }

  const data = payload.data;

  if (
    !isRecord(data) ||
    typeof data.code !== 'string' ||
    typeof data.message !== 'string'
  ) {
    return null;
  }

  return {
    type: 'ERROR',
    data: {
      code: data.code,
      message: data.message,
    },
  };
}

export function parseAuctionItemSocketEvent(
  payload: unknown,
): AuctionItemSocketEvent | null {
  const base = parseBaseEvent(payload);

  if (!base || !isRecord(base.data)) {
    return null;
  }

  const data = base.data;

  if (base.type === AUCTION_ITEM_EVENT_TYPES.VIEWER_COUNT_UPDATED) {
    if (typeof data.viewerCount !== 'number') {
      return null;
    }

    return {
      type: AUCTION_ITEM_EVENT_TYPES.VIEWER_COUNT_UPDATED,
      itemId: base.itemId,
      timestamp: base.timestamp,
      data: { viewerCount: data.viewerCount },
    };
  }

  if (base.type === AUCTION_ITEM_EVENT_TYPES.AUCTION_ITEM_SNAPSHOT) {
    if (
      typeof data.status !== 'string' ||
      typeof data.currentPrice !== 'string' ||
      typeof data.startingPrice !== 'string' ||
      typeof data.minIncrement !== 'string'
    ) {
      return null;
    }

    const openedAt =
      data.openedAt === null || typeof data.openedAt === 'string'
        ? data.openedAt
        : null;
    const closedAt =
      data.closedAt === null || typeof data.closedAt === 'string'
        ? data.closedAt
        : null;

    return {
      type: AUCTION_ITEM_EVENT_TYPES.AUCTION_ITEM_SNAPSHOT,
      itemId: base.itemId,
      timestamp: base.timestamp,
      data: {
        status: data.status,
        currentPrice: data.currentPrice,
        startingPrice: data.startingPrice,
        minIncrement: data.minIncrement,
        openedAt,
        closedAt,
      },
    };
  }

  if (base.type === AUCTION_ITEM_EVENT_TYPES.BID_PLACED) {
    if (
      typeof data.bidId !== 'string' ||
      typeof data.amount !== 'string' ||
      typeof data.currentPrice !== 'string' ||
      typeof data.placedAt !== 'string'
    ) {
      return null;
    }

    return withEventId(
      {
        type: AUCTION_ITEM_EVENT_TYPES.BID_PLACED,
        itemId: base.itemId,
        timestamp: base.timestamp,
        data: {
          bidId: data.bidId,
          amount: data.amount,
          currentPrice: data.currentPrice,
          placedAt: data.placedAt,
          bidderId:
            typeof data.bidderId === 'string' ? data.bidderId : undefined,
          bidderName:
            typeof data.bidderName === 'string' ? data.bidderName : undefined,
        },
      },
      base.eventId,
    );
  }

  if (base.type === AUCTION_ITEM_EVENT_TYPES.VIEWER_JOINED) {
    if (
      typeof data.connectionId !== 'string' ||
      typeof data.displayName !== 'string' ||
      typeof data.viewerCount !== 'number'
    ) {
      return null;
    }

    return withEventId(
      {
        type: AUCTION_ITEM_EVENT_TYPES.VIEWER_JOINED,
        itemId: base.itemId,
        timestamp: base.timestamp,
        data: {
          connectionId: data.connectionId,
          userId: typeof data.userId === 'string' ? data.userId : undefined,
          displayName: data.displayName,
          viewerCount: data.viewerCount,
        },
      },
      base.eventId,
    );
  }

  if (base.type === AUCTION_ITEM_EVENT_TYPES.VIEWER_LEFT) {
    if (
      typeof data.connectionId !== 'string' ||
      typeof data.displayName !== 'string' ||
      typeof data.viewerCount !== 'number'
    ) {
      return null;
    }

    return withEventId(
      {
        type: AUCTION_ITEM_EVENT_TYPES.VIEWER_LEFT,
        itemId: base.itemId,
        timestamp: base.timestamp,
        data: {
          connectionId: data.connectionId,
          userId: typeof data.userId === 'string' ? data.userId : undefined,
          displayName: data.displayName,
          viewerCount: data.viewerCount,
        },
      },
      base.eventId,
    );
  }

  if (
    base.type === AUCTION_ITEM_EVENT_TYPES.AUCTION_STARTED ||
    base.type === AUCTION_ITEM_EVENT_TYPES.AUCTION_ENDED ||
    base.type === AUCTION_ITEM_EVENT_TYPES.AUCTION_CANCELLED
  ) {
    if (typeof data.message !== 'string') {
      return null;
    }

    return withEventId(
      {
        type: base.type,
        itemId: base.itemId,
        timestamp: base.timestamp,
        data: { message: data.message },
      },
      base.eventId,
    );
  }

  if (base.type === AUCTION_ITEM_EVENT_TYPES.ITEM_SOLD) {
    if (
      typeof data.winnerUserId !== 'string' ||
      typeof data.winnerName !== 'string' ||
      typeof data.finalPrice !== 'string'
    ) {
      return null;
    }

    return withEventId(
      {
        type: AUCTION_ITEM_EVENT_TYPES.ITEM_SOLD,
        itemId: base.itemId,
        timestamp: base.timestamp,
        data: {
          winnerUserId: data.winnerUserId,
          winnerName: data.winnerName,
          finalPrice: data.finalPrice,
        },
      },
      base.eventId,
    );
  }

  if (base.type === AUCTION_ITEM_EVENT_TYPES.ITEM_UNSOLD) {
    if (typeof data.message !== 'string') {
      return null;
    }

    return withEventId(
      {
        type: AUCTION_ITEM_EVENT_TYPES.ITEM_UNSOLD,
        itemId: base.itemId,
        timestamp: base.timestamp,
        data: { message: data.message },
      },
      base.eventId,
    );
  }

  if (base.type === AUCTION_ITEM_EVENT_TYPES.CHAT_MESSAGE_SENT) {
    if (
      typeof data.messageId !== 'string' ||
      typeof data.userId !== 'string' ||
      typeof data.senderName !== 'string' ||
      typeof data.content !== 'string'
    ) {
      return null;
    }

    return {
      type: AUCTION_ITEM_EVENT_TYPES.CHAT_MESSAGE_SENT,
      itemId: base.itemId,
      timestamp: base.timestamp,
      data: {
        messageId: data.messageId,
        userId: data.userId,
        senderName: data.senderName,
        content: data.content,
      },
    };
  }

  return null;
}

export function getOrCreateClientSessionId(itemId: string): string {
  const storageKey = `auction-item-ws-session-${itemId}`;

  try {
    const existing = sessionStorage.getItem(storageKey);

    if (existing) {
      return existing;
    }

    const created = crypto.randomUUID();
    sessionStorage.setItem(storageKey, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

export function buildAuctionItemWebSocketUrl(
  itemId: string,
  options: {
    accessToken?: string | null;
    clientSessionId?: string | null;
  } = {},
): string {
  const configuredBase =
    import.meta.env.VITE_WS_BASE_URL ?? 'ws://localhost:8000';

  const normalizedBase = configuredBase.replace(/\/$/, '');
  const baseUrl = `${normalizedBase}/ws/auction-items/${itemId}`;
  const params = new URLSearchParams();

  if (options.accessToken) {
    params.set('token', options.accessToken);
  }

  if (options.clientSessionId) {
    params.set('sessionId', options.clientSessionId);
  }

  const query = params.toString();

  return query ? `${baseUrl}?${query}` : baseUrl;
}

export type AuctionItemSocketHandlers = {
  onOpen?: () => void;
  onClose?: () => void;
  onConnectionStatusChange?: (status: ConnectionStatus) => void;
  onViewerCountUpdated?: (viewerCount: number) => void;
  onAuctionItemSnapshot?: (event: AuctionItemSnapshotEvent) => void;
  onBidPlaced?: (event: BidPlacedEvent) => void;
  onChatMessageSent?: (event: ChatMessageSentEvent) => void;
  onTimelineEvent?: (event: AuctionItemSocketEvent) => void;
  onErrorEvent?: (event: AuctionWebSocketErrorEvent) => void;
  onUnknownEvent?: (type: string) => void;
};

export type AuctionItemSocketConnectOptions = {
  accessToken?: string | null;
  clientSessionId?: string | null;
};

const PING_INTERVAL_MS = 25_000;
const RECONNECT_DELAY_MS = 2_000;

export class AuctionItemSocketClient {
  private socket: WebSocket | null = null;

  private pingTimer: ReturnType<typeof setInterval> | null = null;

  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private intentionalClose = false;

  private itemId = '';

  private accessToken: string | null = null;

  private clientSessionId: string | null = null;

  private handlers: AuctionItemSocketHandlers = {};

  private pageHideHandler: (() => void) | null = null;

  connect(
    itemId: string,
    handlers: AuctionItemSocketHandlers = {},
    options: AuctionItemSocketConnectOptions = {},
  ): void {
    this.itemId = itemId;
    this.handlers = handlers;
    this.accessToken = options.accessToken ?? null;
    this.clientSessionId = options.clientSessionId ?? null;
    this.intentionalClose = false;
    this.setConnectionStatus('connecting');
    this.registerPageHideHandler();
    this.openSocket();
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.clearPingTimer();
    this.clearReconnectTimer();
    this.unregisterPageHideHandler();

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    this.setConnectionStatus('disconnected');
  }

  sendChatMessage(content: string): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      return false;
    }

    this.socket.send(
      JSON.stringify({
        type: 'SEND_CHAT_MESSAGE',
        data: { content },
      }),
    );

    return true;
  }

  isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  private setConnectionStatus(status: ConnectionStatus): void {
    this.handlers.onConnectionStatusChange?.(status);
  }

  private registerPageHideHandler(): void {
    this.unregisterPageHideHandler();

    this.pageHideHandler = () => {
      this.disconnect();
    };

    window.addEventListener('pagehide', this.pageHideHandler);
  }

  private unregisterPageHideHandler(): void {
    if (this.pageHideHandler) {
      window.removeEventListener('pagehide', this.pageHideHandler);
      this.pageHideHandler = null;
    }
  }

  private openSocket(): void {
    this.clearPingTimer();
    this.clearReconnectTimer();

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    const url = buildAuctionItemWebSocketUrl(this.itemId, {
      accessToken: this.accessToken,
      clientSessionId: this.clientSessionId,
    });
    const socket = new WebSocket(url);
    this.socket = socket;

    socket.addEventListener('open', () => {
      this.handlers.onOpen?.();
      this.setConnectionStatus('connected');
      this.startPingTimer();
    });

    socket.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') {
        return;
      }

      if (event.data === 'PONG') {
        return;
      }

      try {
        const rawPayload = JSON.parse(event.data) as unknown;

        if (isRecord(rawPayload) && rawPayload.type === 'PONG') {
          return;
        }

        const errorEvent = parseAuctionWebSocketErrorEvent(rawPayload);

        if (errorEvent) {
          this.handlers.onErrorEvent?.(errorEvent);
          return;
        }

        const parsed = parseAuctionItemSocketEvent(rawPayload);

        if (!parsed || parsed.itemId !== this.itemId) {
          if (
            isRecord(rawPayload) &&
            typeof rawPayload.type === 'string'
          ) {
            this.handlers.onUnknownEvent?.(rawPayload.type);
          }
          return;
        }

        switch (parsed.type) {
          case AUCTION_ITEM_EVENT_TYPES.VIEWER_COUNT_UPDATED:
            this.handlers.onViewerCountUpdated?.(parsed.data.viewerCount);
            break;
          case AUCTION_ITEM_EVENT_TYPES.AUCTION_ITEM_SNAPSHOT:
            this.handlers.onAuctionItemSnapshot?.(parsed);
            break;
          case AUCTION_ITEM_EVENT_TYPES.BID_PLACED:
            this.handlers.onBidPlaced?.(parsed);
            this.handlers.onTimelineEvent?.(parsed);
            break;
          case AUCTION_ITEM_EVENT_TYPES.CHAT_MESSAGE_SENT:
            this.handlers.onChatMessageSent?.(parsed);
            this.handlers.onTimelineEvent?.(parsed);
            break;
          case AUCTION_ITEM_EVENT_TYPES.VIEWER_JOINED:
          case AUCTION_ITEM_EVENT_TYPES.VIEWER_LEFT:
          case AUCTION_ITEM_EVENT_TYPES.AUCTION_STARTED:
          case AUCTION_ITEM_EVENT_TYPES.AUCTION_ENDED:
          case AUCTION_ITEM_EVENT_TYPES.AUCTION_CANCELLED:
          case AUCTION_ITEM_EVENT_TYPES.ITEM_SOLD:
          case AUCTION_ITEM_EVENT_TYPES.ITEM_UNSOLD:
            this.handlers.onTimelineEvent?.(parsed);
            break;
          default:
            break;
        }
      } catch {
        // Ignore malformed realtime payloads.
      }
    });

    socket.addEventListener('close', () => {
      this.clearPingTimer();
      this.handlers.onClose?.();

      if (!this.intentionalClose) {
        this.setConnectionStatus('reconnecting');
        this.scheduleReconnect();
      }
    });

    socket.addEventListener('error', () => {
      socket.close();
    });
  }

  private startPingTimer(): void {
    this.clearPingTimer();

    this.pingTimer = setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ type: 'PING' }));
      }
    }, PING_INTERVAL_MS);
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;

      if (!this.intentionalClose && this.itemId) {
        this.openSocket();
      }
    }, RECONNECT_DELAY_MS);
  }

  private clearPingTimer(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
