import {
  joinRoom,
  parseAuctionEvent,
  type AuctionCommand,
  type AuctionEvent,
  type ProtocolFailureReason,
} from './protocol';

export type SocketState = 'idle' | 'connecting' | 'open' | 'joined' | 'error' | 'closed';

export type SocketDiagnostic =
  | { type: 'state'; state: SocketState }
  | { type: 'event'; eventType: AuctionEvent['type'] }
  | { type: 'protocol_error'; reason: ProtocolFailureReason };

export type SocketLike = {
  readyState: number;
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  send(data: string): void;
  close(): void;
};

export type SocketFactory = (url: string) => SocketLike;

type AuctionSocketOptions = {
  url: string;
  itemId: string;
  joinDelayMs?: number;
  joinTimeoutMs?: number;
  factory?: SocketFactory;
  onEvent(event: AuctionEvent): void;
  onState(state: SocketState): void;
  diagnostic?(diagnostic: SocketDiagnostic): void;
};

const defaultFactory: SocketFactory = (url) => new WebSocket(url);

async function readBinaryMessageText(data: unknown): Promise<string | null> {
  if (data instanceof Blob) return data.text();
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  return null;
}

export class AuctionSocketError extends Error {
  readonly code = 'SOCKET_CONNECT_FAILED';

  constructor() {
    super('Unable to open the realtime connection.');
    this.name = 'AuctionSocketError';
  }
}

export class AuctionSocket {
  private socket: SocketLike | null = null;
  private state: SocketState = 'idle';
  private closed = false;
  private joinDispatchTimer: ReturnType<typeof setTimeout> | null = null;
  private joinTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: AuctionSocketOptions) {}

  connect(idToken: string): void {
    if (this.socket || this.closed) return;

    const endpoint = new URL(this.options.url);
    endpoint.searchParams.set('token', idToken);
    let socket: SocketLike;
    try {
      socket = (this.options.factory ?? defaultFactory)(endpoint.toString());
    } catch {
      this.updateState('error');
      throw new AuctionSocketError();
    }
    this.socket = socket;
    this.updateState('connecting');
    if (this.socket !== socket || this.closed) return;

    socket.onopen = () => {
      if (this.socket !== socket || this.closed) return;
      this.updateState('open');
      if (this.socket !== socket || this.closed || socket.readyState !== 1) return;
      this.scheduleJoin(socket);
    };
    socket.onmessage = (message) => {
      if (typeof message.data === 'string') {
        this.handleTextMessage(socket, message.data);
        return;
      }
      void this.handleBinaryMessage(socket, message.data);
    };
    socket.onerror = () => {
      if (this.socket !== socket || this.closed) return;
      this.clearJoinDispatch();
      this.clearJoinTimeout();
      this.updateState('error');
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.clearJoinDispatch();
      this.clearJoinTimeout();
      this.socket = null;
      this.closed = true;
      this.updateState('closed');
    };
  }

  send(command: AuctionCommand): boolean {
    if (!this.socket || this.closed || this.socket.readyState !== 1) return false;
    this.socket.send(JSON.stringify(command));
    return true;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.clearJoinDispatch();
    this.clearJoinTimeout();
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      socket.close();
    }
    this.updateState('closed');
  }

  private async handleBinaryMessage(socket: SocketLike, data: unknown): Promise<void> {
    let text: string | null;
    try {
      text = await readBinaryMessageText(data);
    } catch {
      text = null;
    }
    if (text === null) {
      if (this.socket === socket && !this.closed) {
        this.options.diagnostic?.({ type: 'protocol_error', reason: 'MALFORMED_MESSAGE' });
      }
      return;
    }
    this.handleTextMessage(socket, text);
  }

  private handleTextMessage(socket: SocketLike, text: string): void {
    if (this.socket !== socket || this.closed) return;
    const result = parseAuctionEvent(text, this.options.itemId);
    if (!result.ok) {
      this.options.diagnostic?.({ type: 'protocol_error', reason: result.reason });
      return;
    }
    this.options.diagnostic?.({ type: 'event', eventType: result.event.type });
    if (this.socket !== socket || this.closed) return;
    if (result.event.type === 'room_joined') this.clearJoinTimeout();
    this.options.onEvent(result.event);
    if (
      result.event.type === 'room_joined'
      && this.socket === socket
      && !this.closed
    ) this.updateState('joined');
  }

  private updateState(state: SocketState): void {
    if (this.state === state) return;
    this.state = state;
    this.options.diagnostic?.({ type: 'state', state });
    if (this.state !== state) return;
    this.options.onState(state);
  }

  private scheduleJoin(socket: SocketLike): void {
    const sendJoin = () => {
      this.joinDispatchTimer = null;
      if (
        this.socket !== socket
        || this.closed
        || this.state !== 'open'
        || socket.readyState !== 1
      ) return;
      socket.send(JSON.stringify(joinRoom(this.options.itemId)));
      this.startJoinTimeout(socket);
    };
    const delayMs = this.options.joinDelayMs ?? 0;
    if (!Number.isFinite(delayMs) || delayMs <= 0) {
      sendJoin();
      return;
    }
    this.clearJoinDispatch();
    this.joinDispatchTimer = setTimeout(sendJoin, delayMs);
  }

  private clearJoinDispatch(): void {
    if (this.joinDispatchTimer === null) return;
    clearTimeout(this.joinDispatchTimer);
    this.joinDispatchTimer = null;
  }

  private startJoinTimeout(socket: SocketLike): void {
    const timeoutMs = this.options.joinTimeoutMs;
    if (timeoutMs === undefined || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      return;
    }
    this.clearJoinTimeout();
    this.joinTimer = setTimeout(() => {
      this.joinTimer = null;
      if (
        this.socket !== socket
        || this.closed
        || this.state !== 'open'
        || socket.readyState !== 1
      ) return;
      this.updateState('error');
      if (this.socket === socket && !this.closed) socket.close();
    }, timeoutMs);
  }

  private clearJoinTimeout(): void {
    if (this.joinTimer === null) return;
    clearTimeout(this.joinTimer);
    this.joinTimer = null;
  }
}
