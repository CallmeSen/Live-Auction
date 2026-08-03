import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogApi } from '../../../services/serverless/catalogApi';

vi.mock('../../../hooks/useAuth', () => ({
  default: () => ({
    getIdToken: vi.fn(),
    logout: vi.fn(),
    session: { sub: 'user-1', email: 'user@example.test', role: 'USER' },
  }),
}));

vi.mock('../../auction-room/useAuctionRoom', () => ({
  useAuctionRoom: vi.fn(),
}));

vi.mock('../../../config/runtime', () => ({
  runtimeConfig: {
    region: 'ap-southeast-1',
    userPoolId: 'pool',
    userPoolClientId: 'client',
    restApiUrl: 'https://rest.example.test',
    restApiKey: 'api-key',
    websocketUrl: 'wss://ws.example.test',
  },
}));

import AuctionDetailPage from './AuctionDetailPage';
import { useAuctionRoom } from '../../auction-room/useAuctionRoom';

const roomHook = vi.mocked(useAuctionRoom);

function createApi() {
  return {
    listSessions: vi.fn(),
    getSession: vi.fn().mockResolvedValue({
      rules: { minIncrement: '5.00' },
    }),
    listItems: vi.fn(),
    getItem: vi.fn(),
    listMyBids: vi.fn(),
  } as unknown as CatalogApi;
}

function item(
  status: 'LIVE' | 'WAITING' = 'LIVE',
  itemId = 'item-1',
) {
  return {
    id: itemId,
    sessionId: 'session-1',
    sequenceNumber: 1,
    name: itemId === 'item-1' ? 'Signed print' : 'Second print',
    description: 'A numbered print',
    categoryId: 'prints',
    startPrice: '100.00',
    durationSeconds: 90,
    status,
    imageKeys: [],
    createdAt: 1_700_000_000,
    updatedAt: 1_700_000_100,
    ...(status === 'LIVE' ? {
      live: {
        status: 'LIVE' as const,
        currentPrice: '110.00',
        endTime: 1_700_000_300,
        extensionCount: 2,
      },
    } : {}),
  };
}

function setRoomState() {
  roomHook.mockReturnValue({
    connectionState: 'joined',
    item: item(),
    currentPrice: '120.00',
    endTime: 1_800_000_000,
    highestBidderAlias: 'Bidder #21',
    bidderAlias: 'Bidder #12',
    extensionCount: 3,
    lastEvent: null,
    retry: vi.fn(),
    sendBid: vi.fn(),
  });
}

function renderPage(api: CatalogApi) {
  return render(
    <MemoryRouter initialEntries={['/auction-items/item-1']}>
      <Routes>
        <Route
          path="/auction-items/:id"
          element={<AuctionDetailPage catalogApi={api} />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

function RouteChangeButton() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate('/auction-items/item-2')}>
      Chuyển vật phẩm
    </button>
  );
}

describe('AuctionDetailPage', () => {
  beforeEach(() => {
    roomHook.mockReset();
  });

  it('renders LIVE room state and the bidder-only bid form', async () => {
    const api = createApi();
    api.getItem = vi.fn().mockResolvedValue(item());
    setRoomState();

    renderPage(api);

    expect(screen.getByRole('status')).toHaveTextContent(/đang tải/i);
    expect(await screen.findByRole('heading', { name: 'Signed print' })).toBeVisible();
    expect(screen.getByLabelText('Giá hiện tại')).toHaveTextContent('120.00');
    expect(screen.getByText(/3 lần gia hạn/i)).toBeVisible();
    expect(roomHook).toHaveBeenCalledWith(expect.objectContaining({
      itemId: 'item-1',
      catalogApi: api,
    }));
    expect(await screen.findByRole('button', { name: 'Xác nhận trả giá' })).toBeVisible();
  });

  it('uses catalog status for non-live items and omits the live panel', async () => {
    const api = createApi();
    api.getItem = vi.fn().mockResolvedValue(item('WAITING'));
    setRoomState();

    renderPage(api);

    await screen.findByRole('heading', { name: 'Signed print' });
    expect(screen.getByText('WAITING')).toBeVisible();
    expect(screen.queryByText(/giá hiện tại/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/gia hạn/i)).not.toBeInTheDocument();
    expect(roomHook).not.toHaveBeenCalled();
  });

  it('uses the server session rule for the suggested bid minimum', async () => {
    const api = createApi();
    api.getItem = vi.fn().mockResolvedValue(item());
    setRoomState();

    renderPage(api);

    expect(await screen.findByRole('heading', { name: 'Signed print' })).toBeVisible();
    await waitFor(() => expect(api.getSession).toHaveBeenCalledWith('session-1'));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Giá của bạn' }))
      .toHaveValue('125.00'));
  });

  it('clears the previous room while a new route item is loading', async () => {
    const user = userEvent.setup();
    const api = createApi();
    let resolveNext!: (value: ReturnType<typeof item>) => void;
    api.getItem = vi.fn()
      .mockResolvedValueOnce(item('LIVE', 'item-1'))
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveNext = resolve;
      }));
    setRoomState();

    render(
      <MemoryRouter initialEntries={['/auction-items/item-1']}>
        <RouteChangeButton />
        <Routes>
          <Route
            path="/auction-items/:id"
            element={<AuctionDetailPage catalogApi={api} />}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Signed print' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Chuyển vật phẩm' }));

    await waitFor(() => expect(api.getItem).toHaveBeenLastCalledWith('item-2'));
    expect(screen.queryByRole('heading', { name: 'Signed print' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/đang tải/i);

    resolveNext(item('LIVE', 'item-2'));
    expect(await screen.findByRole('heading', { name: 'Second print' })).toBeVisible();
  });

  it('clears an earlier route error before loading the next item', async () => {
    const user = userEvent.setup();
    const api = createApi();
    let resolveNext!: (value: ReturnType<typeof item>) => void;
    api.getItem = vi.fn()
      .mockRejectedValueOnce(new Error('first item failed'))
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveNext = resolve;
      }));

    render(
      <MemoryRouter initialEntries={['/auction-items/item-1']}>
        <RouteChangeButton />
        <Routes>
          <Route
            path="/auction-items/:id"
            element={<AuctionDetailPage catalogApi={api} />}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('alert')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Chuyển vật phẩm' }));

    await waitFor(() => expect(api.getItem).toHaveBeenLastCalledWith('item-2'));
    expect(screen.getByRole('status')).toHaveTextContent(/đang tải/i);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    resolveNext(item('WAITING', 'item-2'));
    expect(await screen.findByRole('heading', { name: 'Second print' })).toBeVisible();
  });

  it('shows a safe error and retries the item request', async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.getItem = vi.fn()
      .mockRejectedValueOnce(new Error('private-header-value'))
      .mockResolvedValueOnce(item());
    setRoomState();

    renderPage(api);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không thể tải thông tin vật phẩm.',
    );
    expect(screen.queryByText(/private-header-value/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /thử lại/i }));

    await waitFor(() => expect(api.getItem).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('heading', { name: 'Signed print' })).toBeVisible();
  });
});
