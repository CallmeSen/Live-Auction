import { StrictMode, type PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CatalogApi } from '../../services/serverless/catalogApi';
import type { AuctionItem } from '../../services/serverless/mappers';
import type { SocketLike } from '../../realtime/AuctionSocket';

vi.mock('../../hooks/useAuth', () => ({
  default: () => ({ getIdToken: vi.fn(), logout: vi.fn() }),
}));

vi.mock('../../config/runtime', () => ({
  runtimeConfig: {
    region: 'ap-southeast-1',
    userPoolId: 'pool',
    userPoolClientId: 'client',
    restApiUrl: 'https://rest.example.test',
    restApiKey: 'api-key',
    websocketUrl: 'wss://socket.example.test/prod',
    mediaBaseUrl: 'https://media.example.test',
  },
}));

import { useAuctionRoom } from './useAuctionRoom';

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

  message(payload: object) {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(payload) }));
  }

  serverClose() {
    this.readyState = 3;
    this.onclose?.(new CloseEvent('close', { code: 1006 }));
  }

  serverError() {
    this.onerror?.(new Event('error'));
  }
}

function item(id: string, price = '100'): AuctionItem {
  return {
    id,
    sessionId: 'session-1',
    sequenceNumber: 1,
    name: 'Signed print',
    description: '',
    categoryId: null,
    startPrice: '100',
    durationSeconds: 90,
    status: 'LIVE',
    imageKeys: [],
    createdAt: 1_700_000_000,
    updatedAt: 1_700_000_000,
    live: {
      status: 'LIVE',
      currentPrice: price,
      endTime: 1_800_000_000,
      extensionCount: 0,
    },
  };
}

function setup(overrides: {
  getItem?: ReturnType<typeof vi.fn<(id: string) => Promise<AuctionItem>>>;
  getIdToken?: ReturnType<typeof vi.fn<() => Promise<string>>>;
  isOnline?: () => boolean;
} = {}) {
  const getItem = overrides.getItem
    ?? vi.fn<(id: string) => Promise<AuctionItem>>().mockResolvedValue(item('item-1'));
  const catalogApi = { getItem } as unknown as CatalogApi;
  const getIdToken = overrides.getIdToken
    ?? vi.fn<() => Promise<string>>().mockResolvedValue('token-1');
  const sockets: FakeSocket[] = [];
  const socketFactory = vi.fn<(url: string) => SocketLike>(() => {
    const socket = new FakeSocket();
    sockets.push(socket);
    return socket;
  });
  const options = {
    itemId: 'item-1',
    catalogApi,
    getIdToken,
    websocketUrl: 'wss://socket.example.test/prod',
    socketFactory,
    joinDelayMs: 0,
    joinTimeoutMs: 0,
    jitter: () => 0,
    isOnline: overrides.isOnline ?? (() => true),
  };
  return { options, getItem, getIdToken, sockets, socketFactory };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('useAuctionRoom', () => {
  it('loads the REST snapshot before opening a socket and reduces current-item events', async () => {
    const context = setup();
    const { result } = renderHook(() => useAuctionRoom(context.options));

    expect(result.current.connectionState).toBe('loading');
    await waitFor(() => expect(context.sockets).toHaveLength(1));
    expect(context.getItem.mock.invocationCallOrder[0])
      .toBeLessThan(context.socketFactory.mock.invocationCallOrder[0]);
    expect(result.current.currentPrice).toBe('100');

    act(() => {
      context.sockets[0].open();
      context.sockets[0].message({
        type: 'room_joined',
        item_id: 'item-1',
        bidder_alias: 'Bidder #12',
      });
      context.sockets[0].message({
        type: 'price_update',
        item_id: 'item-1',
        status: 'ACCEPTED',
        request_id: 'request-123',
        current_price: '101.25',
        end_time: 1_800_000_060,
        extension_count: 1,
      });
      context.sockets[0].message({
        type: 'price_update',
        item_id: 'item-2',
        status: 'ACCEPTED',
        request_id: 'request-456',
        current_price: '999',
      });
      context.sockets[0].message({
        type: 'bid_result',
        item_id: 'item-1',
        status: 'REJECTED',
        reason: 'REJECTED_LOW_INCREMENT',
        request_id: 'request-789',
        current_price: '102',
        highest_bidder_alias: 'Bidder #21',
        end_time: 1_800_000_120,
      });
    });

    expect(result.current.connectionState).toBe('joined');
    expect(result.current.bidderAlias).toBe('Bidder #12');
    expect(result.current.currentPrice).toBe('102');
    expect(result.current.highestBidderAlias).toBe('Bidder #21');
    expect(result.current.endTime).toBe(1_800_000_120);
    expect(result.current.extensionCount).toBe(1);
  });

  it('reconnects when the socket reports an error without closing', async () => {
    vi.useFakeTimers();
    const context = setup();
    const { result } = renderHook(() => useAuctionRoom(context.options));
    await flushPromises();
    expect(context.sockets).toHaveLength(1);

    act(() => context.sockets[0].serverError());
    expect(result.current.connectionState).toBe('reconnecting');
    expect(context.sockets[0].close).toHaveBeenCalledTimes(1);

    await act(async () => vi.advanceTimersByTime(1_000));
    await flushPromises();
    expect(context.sockets).toHaveLength(2);
  });

  it('refreshes REST and obtains a fresh token before every reconnect', async () => {
    vi.useFakeTimers();
    const context = setup({
      getIdToken: vi.fn<() => Promise<string>>()
        .mockResolvedValueOnce('token-1')
        .mockResolvedValueOnce('token-2'),
    });
    renderHook(() => useAuctionRoom(context.options));
    await flushPromises();
    expect(context.sockets).toHaveLength(1);

    act(() => context.sockets[0].serverClose());
    expect(context.getItem).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTime(999));
    expect(context.getItem).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTime(1));
    await flushPromises();

    expect(context.getItem).toHaveBeenCalledTimes(2);
    expect(context.getIdToken).toHaveBeenCalledTimes(2);
    expect(context.sockets).toHaveLength(2);
    expect(new URL(context.socketFactory.mock.calls[1][0]).searchParams.get('token'))
      .toBe('token-2');
    expect(context.getItem.mock.invocationCallOrder[1])
      .toBeLessThan(context.socketFactory.mock.invocationCallOrder[1]);
  });

  it('stops after five bounded reconnect attempts until retry is invoked', async () => {
    vi.useFakeTimers();
    let online = true;
    const context = setup({ isOnline: () => online });
    const { result } = renderHook(() => useAuctionRoom(context.options));
    await flushPromises();

    const delays = [1_000, 2_000, 4_000, 8_000, 10_000];
    for (const delay of delays) {
      act(() => context.sockets.at(-1)?.serverClose());
      await act(async () => vi.advanceTimersByTime(delay));
      await flushPromises();
    }
    online = false;
    act(() => context.sockets.at(-1)?.serverClose());

    expect(context.sockets).toHaveLength(6);
    expect(result.current.connectionState).toBe('failed');

    online = true;
    act(() => {
      window.dispatchEvent(new Event('offline'));
      window.dispatchEvent(new Event('online'));
    });
    await flushPromises();
    expect(context.sockets).toHaveLength(6);
    expect(result.current.connectionState).toBe('failed');

    act(() => result.current.retry());
    await flushPromises();
    expect(context.sockets).toHaveLength(7);
  });

  it('pauses reconnects while offline and refreshes immediately when online', async () => {
    vi.useFakeTimers();
    let online = true;
    const context = setup({ isOnline: () => online });
    const { result } = renderHook(() => useAuctionRoom(context.options));
    await flushPromises();

    online = false;
    act(() => window.dispatchEvent(new Event('offline')));
    expect(result.current.connectionState).toBe('offline');
    expect(context.sockets[0].close).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTime(20_000));
    expect(context.sockets).toHaveLength(1);

    online = true;
    act(() => window.dispatchEvent(new Event('online')));
    await flushPromises();
    expect(context.getItem).toHaveBeenCalledTimes(2);
    expect(context.sockets).toHaveLength(2);
  });

  it('enters offline state when connectivity changes while a token is pending', async () => {
    let online = true;
    const token = deferred<string>();
    const context = setup({
      isOnline: () => online,
      getIdToken: vi.fn<() => Promise<string>>(() => token.promise),
    });
    const { result } = renderHook(() => useAuctionRoom(context.options));
    await waitFor(() => expect(context.getIdToken).toHaveBeenCalledTimes(1));
    expect(result.current.connectionState).toBe('connecting');

    online = false;
    await act(async () => token.resolve('token-1'));
    await flushPromises();

    expect(context.sockets).toHaveLength(0);
    expect(result.current.connectionState).toBe('offline');
  });

  it('uses the authoritative final price when a REST snapshot is closed', async () => {
    const sold = { ...item('item-1'), status: 'SOLD' as const, finalPrice: '150', live: undefined };
    const context = setup({
      getItem: vi.fn<(id: string) => Promise<AuctionItem>>().mockResolvedValue(sold),
    });
    const { result } = renderHook(() => useAuctionRoom(context.options));

    await waitFor(() => expect(result.current.connectionState).toBe('closed'));
    expect(result.current.currentPrice).toBe('150');
    expect(context.sockets).toHaveLength(0);
  });

  it('closes stale sockets on item change and unmount', async () => {
    const context = setup({
      getItem: vi.fn<(id: string) => Promise<AuctionItem>>(
        (id) => Promise.resolve(item(id)),
      ),
    });
    const { result, rerender, unmount } = renderHook(
      ({ itemId }) => useAuctionRoom({ ...context.options, itemId }),
      { initialProps: { itemId: 'item-1' } },
    );
    await waitFor(() => expect(context.sockets).toHaveLength(1));

    rerender({ itemId: 'item-2' });
    expect(result.current.sendBid('101', 'request-123')).toBe(false);
    await waitFor(() => expect(context.sockets).toHaveLength(2));
    expect(context.sockets[0].close).toHaveBeenCalledTimes(1);
    expect(context.getItem).toHaveBeenLastCalledWith('item-2');

    unmount();
    expect(context.sockets[1].close).toHaveBeenCalledTimes(1);
  });

  it('ignores a stale REST response after the item changes', async () => {
    const oldResponse = deferred<AuctionItem>();
    const newResponse = deferred<AuctionItem>();
    const context = setup({
      getItem: vi.fn<(id: string) => Promise<AuctionItem>>((id) => (
        id === 'item-1' ? oldResponse.promise : newResponse.promise
      )),
    });
    const { result, rerender } = renderHook(
      ({ itemId }) => useAuctionRoom({ ...context.options, itemId }),
      { initialProps: { itemId: 'item-1' } },
    );

    rerender({ itemId: 'item-2' });
    await act(async () => newResponse.resolve(item('item-2', '200')));
    await waitFor(() => expect(context.sockets).toHaveLength(1));
    expect(result.current.item?.id).toBe('item-2');

    await act(async () => oldResponse.resolve(item('item-1', '100')));
    await flushPromises();
    expect(context.sockets).toHaveLength(1);
    expect(result.current.item?.id).toBe('item-2');
    expect(result.current.currentPrice).toBe('200');
  });

  it('does not create duplicate sockets under React Strict Mode', async () => {
    const context = setup();
    const wrapper = ({ children }: PropsWithChildren) => (
      <StrictMode>{children}</StrictMode>
    );
    renderHook(() => useAuctionRoom(context.options), { wrapper });

    await waitFor(() => expect(context.sockets).toHaveLength(1));
    expect(context.getItem).toHaveBeenCalled();
  });

  it('reconnects when a live socket does not acknowledge joinRoom', async () => {
    vi.useFakeTimers();
    const context = setup();
    context.options.joinTimeoutMs = 50;
    const { result } = renderHook(() => useAuctionRoom(context.options));
    await flushPromises();

    act(() => context.sockets[0].open());
    await act(async () => vi.advanceTimersByTime(50));
    expect(result.current.connectionState).toBe('reconnecting');
    expect(context.sockets[0].close).toHaveBeenCalledTimes(1);

    await act(async () => vi.advanceTimersByTime(1_000));
    await flushPromises();
    expect(context.sockets).toHaveLength(2);
    vi.useRealTimers();
  });

  it('keeps default browser dependencies stable across state renders', async () => {
    const context = setup();
    const browserOptions = {
      ...context.options,
      jitter: undefined,
      isOnline: undefined,
    };
    renderHook(() => useAuctionRoom(browserOptions));

    await waitFor(() => expect(context.sockets).toHaveLength(1));
    await flushPromises();
    expect(context.getItem).toHaveBeenCalledTimes(1);
    expect(context.sockets).toHaveLength(1);
  });
});
