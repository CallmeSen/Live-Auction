import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogApi } from '../../../services/serverless/catalogApi';

vi.mock('../../../hooks/useAuth', () => ({
  default: () => ({ session: null, getIdToken: vi.fn(), logout: vi.fn() }),
}));

vi.mock('../../../config/runtime', () => ({
  runtimeConfig: {
    region: 'ap-southeast-1',
    userPoolId: 'pool',
    userPoolClientId: 'client',
    restApiUrl: 'https://rest.example.test',
    restApiKey: 'api-key',
    websocketUrl: 'wss://ws.example.test',
    mediaBaseUrl: 'https://media.example.test',
  },
}));

vi.mock('../../auction-room/useAuctionRoom', () => ({
  useAuctionRoom: vi.fn(),
}));

import AuctionSessionDetailPage from './AuctionSessionDetailPage';
import { useAuctionRoom } from '../../auction-room/useAuctionRoom';

const roomHook = vi.mocked(useAuctionRoom);

function createApi() {
  return {
    listSessions: vi.fn(),
    getSession: vi.fn(),
    listItems: vi.fn(),
    getItem: vi.fn(),
    listMyBids: vi.fn(),
  } as unknown as CatalogApi;
}

const detail = {
  session: {
    id: 'session-1',
    title: 'Evening sale',
    description: 'Prints and books',
    status: 'SCHEDULED' as const,
    itemCount: 1,
    startTime: 1_700_000_200,
    createdAt: 1_700_000_000,
    updatedAt: 1_700_000_100,
  },
  rules: {
    minIncrement: '5.00',
    maxIncrement: '500.00',
    antiSnipeWindowSeconds: 30,
    antiSnipeExtendSeconds: 60,
    maxExtensions: 10,
    publicHistoryLimit: 20,
  },
  items: [{
    id: 'item-1',
    sessionId: 'session-1',
    sequenceNumber: 1,
    name: 'Signed print',
    description: 'Numbered print',
    categoryId: 'prints',
    startPrice: '100.00',
    durationSeconds: 90,
    status: 'WAITING' as const,
    imageKeys: [],
    createdAt: 1_700_000_000,
    updatedAt: 1_700_000_100,
  }],
};

function renderPage(api: CatalogApi) {
  return render(
    <MemoryRouter initialEntries={['/auction-sessions/session-1']}>
      <Routes>
        <Route
          path="/auction-sessions/:id"
          element={<AuctionSessionDetailPage catalogApi={api} />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AuctionSessionDetailPage', () => {
  beforeEach(() => {
    roomHook.mockReset();
  });

  it('renders the serverless session, rules, and item list as read-only data', async () => {
    const api = createApi();
    api.getSession = vi.fn().mockResolvedValue(detail);

    renderPage(api);

    expect(screen.getByRole('status')).toHaveTextContent(/đang tải/i);
    expect(await screen.findByRole('heading', { name: 'Evening sale' })).toBeVisible();
    expect(api.getSession).toHaveBeenCalledWith('session-1');
    expect(screen.getByText('5.00')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Signed print' }))
      .toHaveAttribute('href', '/auction-items/item-1');
    expect(screen.getByRole('link', { name: 'Xem chi tiết vật phẩm' }))
      .toHaveAttribute('href', '/auction-items/item-1');
    expect(screen.queryByRole('button', {
      name: /duyệt|từ chối|hủy|xóa/i,
    })).not.toBeInTheDocument();
  });

  it('renders the realtime current price for a live item', async () => {
    const liveItem = {
      ...detail.items[0],
      status: 'LIVE' as const,
      live: {
        status: 'LIVE' as const,
        currentPrice: '110.00',
        endTime: 1_800_000_000,
        extensionCount: 0,
      },
    };
    const api = createApi();
    api.getSession = vi.fn().mockResolvedValue({
      ...detail,
      session: { ...detail.session, status: 'LIVE' as const },
      items: [liveItem],
    });
    roomHook.mockReturnValue({
      connectionState: 'joined',
      item: liveItem,
      currentPrice: '125.00',
      endTime: 1_800_000_000,
      highestBidderAlias: 'Bidder #1',
      bidderAlias: null,
      extensionCount: 1,
      lastEvent: null,
      retry: vi.fn(),
      sendBid: vi.fn(),
    });

    renderPage(api);

    expect(await screen.findByRole('heading', { name: 'Evening sale' })).toBeVisible();
    expect(screen.getByText('100.00')).toBeVisible();
    expect(screen.getByText('125.00')).toBeVisible();
    expect(roomHook).toHaveBeenCalledWith({
      itemId: 'item-1',
      catalogApi: api,
    });
  });

  it('renders the first catalog image for an item in the session', async () => {
    const api = createApi();
    api.getSession = vi.fn().mockResolvedValue({
      ...detail,
      items: [{
        ...detail.items[0],
        imageKeys: ['items/seller/item-1/cover.jpg'],
      }],
    });

    renderPage(api);

    expect(await screen.findByRole('img', { name: 'Signed print' }))
      .toHaveAttribute(
        'src',
        'https://media.example.test/items/seller/item-1/cover.jpg',
      );
  });

  it('shows a sanitized error and retries', async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.getSession = vi.fn()
      .mockRejectedValueOnce(new Error('authorization-secret'))
      .mockResolvedValueOnce({ ...detail, items: [] });

    renderPage(api);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không thể tải chi tiết phiên đấu giá.',
    );
    expect(screen.queryByText(/authorization-secret/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /thử lại/i }));

    await waitFor(() => expect(api.getSession).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Phiên này chưa có vật phẩm.')).toBeVisible();
  });
});
