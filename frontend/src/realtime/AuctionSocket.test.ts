import { describe, expect, it, vi } from 'vitest';
import { AuctionSocket, type SocketLike } from './AuctionSocket';
import { placeBid } from './protocol';

class FakeSocket implements SocketLike {
  readyState = 0;
  sent: string[] = [];
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  close = vi.fn(() => {
    this.readyState = 3;
  });

  send(data: string) {
    this.sent.push(data);
  }

  open() {
    this.readyState = 1;
    this.onopen?.(new Event('open'));
  }

  message(data: unknown) {
    this.onmessage?.(new MessageEvent('message', { data }));
  }

  serverClose() {
    this.readyState = 3;
    this.onclose?.(new CloseEvent('close', { code: 1006 }));
  }
}

function setup() {
  const sockets: FakeSocket[] = [];
  const factory = vi.fn((url: string) => {
    void url;
    const socket = new FakeSocket();
    sockets.push(socket);
    return socket;
  });
  const onEvent = vi.fn();
  const onState = vi.fn();
  const diagnostic = vi.fn();
  const auctionSocket = new AuctionSocket({
    url: 'wss://socket.example.test/prod?client=web',
    itemId: 'item-1',
    joinDelayMs: 0,
    factory,
    onEvent,
    onState,
    diagnostic,
  });
  return { auctionSocket, sockets, factory, onEvent, onState, diagnostic };
}

describe('AuctionSocket', () => {
  it('encodes the token and joins only after open', () => {
    const { auctionSocket, sockets, factory, onState } = setup();
    const token = 'header.payload+/= ?&secret';

    auctionSocket.connect(token);

    expect(sockets[0].sent).toEqual([]);
    const endpoint = new URL(factory.mock.calls[0][0]);
    expect(endpoint.searchParams.get('client')).toBe('web');
    expect(endpoint.searchParams.get('token')).toBe(token);
    sockets[0].open();
    expect(sockets[0].sent).toEqual([
      JSON.stringify({ action: 'joinRoom', item_id: 'item-1' }),
    ]);
    expect(onState).toHaveBeenCalledWith('open');
  });

  it('emits only guarded current-item events', () => {
    const { auctionSocket, sockets, onEvent, diagnostic } = setup();
    auctionSocket.connect('token');
    sockets[0].open();

    sockets[0].message(JSON.stringify({
      type: 'room_joined',
      item_id: 'item-1',
      bidder_alias: 'Bidder #12',
    }));
    sockets[0].message(JSON.stringify({
      type: 'bid_queued',
      item_id: 'item-2',
      request_id: 'request-123',
    }));
    sockets[0].message('{private malformed body');

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith({
      type: 'room_joined',
      item_id: 'item-1',
      bidder_alias: 'Bidder #12',
    });
    expect(diagnostic).toHaveBeenCalledWith({ type: 'protocol_error', reason: 'WRONG_ITEM' });
    expect(diagnostic).toHaveBeenCalledWith({ type: 'protocol_error', reason: 'MALFORMED_MESSAGE' });
  });

  it('waits for the configured control-plane settle delay before joining', () => {
    vi.useFakeTimers();
    const sockets: FakeSocket[] = [];
    const socket = new AuctionSocket({
      url: 'wss://socket.example.test/prod',
      itemId: 'item-1',
      joinDelayMs: 500,
      factory: () => {
        const next = new FakeSocket();
        sockets.push(next);
        return next;
      },
      onEvent: vi.fn(),
      onState: vi.fn(),
    });

    socket.connect('token');
    sockets[0].open();
    expect(sockets[0].sent).toEqual([]);
    vi.advanceTimersByTime(499);
    expect(sockets[0].sent).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(sockets[0].sent).toEqual([
      JSON.stringify({ action: 'joinRoom', item_id: 'item-1' }),
    ]);
    vi.useRealTimers();
  });

  it('decodes a binary room acknowledgement from the management API', async () => {
    const { auctionSocket, sockets, onEvent } = setup();
    auctionSocket.connect('token');
    sockets[0].open();

    sockets[0].message(new Blob([JSON.stringify({
      type: 'room_joined',
      item_id: 'item-1',
      bidder_alias: 'Bidder #12',
    })]));

    await vi.waitFor(() => {
      expect(onEvent).toHaveBeenCalledWith({
        type: 'room_joined',
        item_id: 'item-1',
        bidder_alias: 'Bidder #12',
      });
    });
  });

  it('sends commands only while open and closes idempotently', () => {
    const { auctionSocket, sockets, onState } = setup();
    const command = placeBid('item-1', '101.25', 'request-123');
    auctionSocket.connect('token');

    expect(auctionSocket.send(command)).toBe(false);
    sockets[0].open();
    expect(auctionSocket.send(command)).toBe(true);
    expect(sockets[0].sent.at(-1)).toBe(JSON.stringify(command));

    auctionSocket.close();
    auctionSocket.close();
    expect(sockets[0].close).toHaveBeenCalledTimes(1);
    expect(onState).toHaveBeenLastCalledWith('closed');
  });

  it('fails an unacknowledged room join without exposing the token', () => {
    vi.useFakeTimers();
    const sockets: FakeSocket[] = [];
    const onState = vi.fn();
    const socket = new AuctionSocket({
      url: 'wss://socket.example.test/prod',
      itemId: 'item-1',
      joinTimeoutMs: 50,
      factory: () => {
        const next = new FakeSocket();
        sockets.push(next);
        return next;
      },
      onEvent: vi.fn(),
      onState,
    });

    socket.connect('private-token-value');
    sockets[0].open();
    vi.advanceTimersByTime(50);

    expect(sockets[0].close).toHaveBeenCalledTimes(1);
    expect(onState).toHaveBeenLastCalledWith('error');
    vi.useRealTimers();
  });

  it('reports only safe state and event diagnostics', () => {
    const { auctionSocket, sockets, diagnostic } = setup();
    const token = 'private-token-value';
    auctionSocket.connect(token);
    sockets[0].open();
    sockets[0].message(JSON.stringify({
      type: 'bid_queued',
      item_id: 'item-1',
      request_id: 'request-123',
    }));
    sockets[0].serverClose();

    const diagnostics = JSON.stringify(diagnostic.mock.calls);
    expect(diagnostics).not.toContain(token);
    expect(diagnostics).not.toContain('socket.example.test');
    expect(diagnostics).toContain('bid_queued');
    expect(diagnostics).toContain('closed');
  });

  it('sanitizes synchronous factory failures', () => {
    const token = 'private-token-value';
    const diagnostic = vi.fn();
    const onState = vi.fn();
    const socket = new AuctionSocket({
      url: 'wss://socket.example.test/prod',
      itemId: 'item-1',
      factory: (url) => {
        throw new Error(`browser rejected ${url}`);
      },
      onEvent: vi.fn(),
      onState,
      diagnostic,
    });

    const error = (() => {
      try {
        socket.connect(token);
      } catch (caught) {
        return caught;
      }
      return undefined;
    })();

    expect(error).toMatchObject({
      code: 'SOCKET_CONNECT_FAILED',
      message: 'Unable to open the realtime connection.',
    });
    expect(String(error)).not.toContain(token);
    expect(JSON.stringify(diagnostic.mock.calls)).not.toContain(token);
    expect(onState).toHaveBeenLastCalledWith('error');
  });

  it('does not join after an open callback closes the socket', () => {
    const sockets: FakeSocket[] = [];
    const holder: { socket?: AuctionSocket } = {};
    const onState = vi.fn((state: string) => {
      if (state === 'open') holder.socket?.close();
    });
    const auctionSocket = new AuctionSocket({
      url: 'wss://socket.example.test/prod',
      itemId: 'item-1',
      factory: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
      onEvent: vi.fn(),
      onState,
    });
    holder.socket = auctionSocket;

    auctionSocket.connect('token');
    sockets[0].open();

    expect(sockets[0].sent).toEqual([]);
    expect(onState).toHaveBeenLastCalledWith('closed');
  });

  it('does not transition to joined after an event callback closes the socket', () => {
    const sockets: FakeSocket[] = [];
    const holder: { socket?: AuctionSocket } = {};
    const onState = vi.fn();
    const auctionSocket = new AuctionSocket({
      url: 'wss://socket.example.test/prod',
      itemId: 'item-1',
      factory: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
      onEvent: () => holder.socket?.close(),
      onState,
    });
    holder.socket = auctionSocket;
    auctionSocket.connect('token');
    sockets[0].open();
    sockets[0].message(JSON.stringify({
      type: 'room_joined',
      item_id: 'item-1',
      bidder_alias: 'Bidder #12',
    }));

    expect(onState).toHaveBeenLastCalledWith('closed');
    expect(onState).not.toHaveBeenCalledWith('joined');
  });
});
