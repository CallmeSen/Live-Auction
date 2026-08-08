import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { CatalogApi } from '../../../services/serverless/catalogApi';

vi.mock('../../../hooks/useAuth', () => ({
  default: () => ({ getIdToken: vi.fn(), logout: vi.fn() }),
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

import MyBidsPage from './MyBidsPage';

function createApi() {
  return {
    listSessions: vi.fn(),
    getSession: vi.fn(),
    listItems: vi.fn(),
    getItem: vi.fn(),
    listMyBids: vi.fn(),
  } as unknown as CatalogApi;
}

const bid = {
  itemId: 'item-1',
  requestId: 'request-1',
  amount: '101.00',
  status: 'REJECTED' as const,
  reason: 'LOW_INCREMENT',
};

function renderPage(api: CatalogApi) {
  return render(
    <MemoryRouter>
      <MyBidsPage catalogApi={api} />
    </MemoryRouter>,
  );
}

describe('MyBidsPage', () => {
  it('renders only projected bidder-history fields', async () => {
    const api = createApi();
    api.listMyBids = vi.fn().mockResolvedValue({
      items: [bid],
      nextCursor: null,
    });

    renderPage(api);

    expect(screen.getByRole('status')).toHaveTextContent(/đang tải/i);
    expect(await screen.findByText('101.00')).toBeVisible();
    expect(screen.getByText('REJECTED')).toBeVisible();
    expect(screen.getByText('LOW_INCREMENT')).toBeVisible();
    expect(screen.getByText(/item-1/)).toBeVisible();
    expect(screen.queryByText(/tên phiên|tên vật phẩm|thắng|thua/i))
      .not.toBeInTheDocument();
  });

  it('shows a safe error and explicitly retries', async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.listMyBids = vi.fn()
      .mockRejectedValueOnce(new Error('sensitive-request'))
      .mockResolvedValueOnce({ items: [], nextCursor: null });

    renderPage(api);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không thể tải lịch sử trả giá.',
    );
    expect(screen.queryByText(/sensitive-request/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /thử lại/i }));

    await waitFor(() => expect(api.listMyBids).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/chưa có lượt trả giá/i)).toBeVisible();
  });

  it('passes opaque cursors to next and previous page requests', async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.listMyBids = vi.fn()
      .mockResolvedValueOnce({ items: [bid], nextCursor: 'opaque+/=' })
      .mockResolvedValueOnce({
        items: [{ ...bid, requestId: 'request-2', amount: '125.00' }],
        nextCursor: null,
      })
      .mockResolvedValueOnce({ items: [bid], nextCursor: 'opaque+/=' });

    renderPage(api);
    await screen.findByText('101.00');

    await user.click(screen.getByRole('button', { name: /trang sau/i }));
    expect(await screen.findByText('125.00')).toBeVisible();
    expect(api.listMyBids).toHaveBeenNthCalledWith(2, {
      pageSize: 20,
      cursor: 'opaque+/=',
    });

    await user.click(screen.getByRole('button', { name: /trang trước/i }));
    expect(await screen.findByText('101.00')).toBeVisible();
  });
});
