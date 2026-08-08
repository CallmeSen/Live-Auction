import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthRole, AuthSession } from '../../../auth/types';
import type { CatalogApi } from '../../../services/serverless/catalogApi';

const authState = vi.hoisted(() => ({
  session: null as AuthSession | null,
}));

vi.mock('../../../hooks/useAuth', () => ({
  default: () => ({
    status: authState.session ? 'authenticated' : 'anonymous',
    session: authState.session,
    getIdToken: vi.fn(),
    logout: vi.fn(),
  }),
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

import AuctionListPage from './AuctionListPage';

function createApi() {
  return {
    listSessions: vi.fn(),
    getSession: vi.fn(),
    listItems: vi.fn(),
    getItem: vi.fn(),
    listMyBids: vi.fn(),
  } as unknown as CatalogApi;
}

function session(id: string, title: string) {
  return {
    id,
    title,
    description: null,
    status: 'SCHEDULED' as const,
    itemCount: 2,
    startTime: 1_700_000_200,
    createdAt: 1_700_000_000,
    updatedAt: 1_700_000_100,
  };
}

function renderPage(api: CatalogApi) {
  return render(
    <MemoryRouter>
      <AuctionListPage catalogApi={api} />
    </MemoryRouter>,
  );
}

function setSession(role: AuthRole) {
  authState.session = {
    sub: `${role.toLowerCase()}-1`,
    email: `${role.toLowerCase()}@example.test`,
    role,
  };
}

describe('AuctionListPage', () => {
  beforeEach(() => {
    authState.session = null;
  });

  it('shows loading then renders serverless sessions without unsupported totals', async () => {
    const api = createApi();
    api.listSessions = vi.fn().mockResolvedValue({
      items: [session('session-1', 'Evening sale')],
      nextCursor: null,
    });

    renderPage(api);

    expect(screen.getByRole('status')).toHaveTextContent(/đang tải/i);
    expect(await screen.findByRole('heading', { name: 'Evening sale' })).toBeVisible();
    expect(screen.queryByText(/tổng|kết quả|trang \d+\/\d+/iu))
      .not.toBeInTheDocument();
  });

  it('shows a sanitized error and explicitly retries', async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.listSessions = vi.fn()
      .mockRejectedValueOnce(new Error('token-value-must-not-render'))
      .mockResolvedValueOnce({ items: [], nextCursor: null });

    renderPage(api);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không thể tải danh sách phiên đấu giá.',
    );
    expect(screen.queryByText(/token-value/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /thử lại/i }));

    await waitFor(() => expect(api.listSessions).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/chưa có phiên đấu giá/i)).toBeVisible();
  });

  it('uses opaque cursor navigation and can return to the previous page', async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.listSessions = vi.fn()
      .mockResolvedValueOnce({
        items: [session('session-1', 'Page one')],
        nextCursor: 'opaque+/=',
      })
      .mockResolvedValueOnce({
        items: [session('session-2', 'Page two')],
        nextCursor: null,
      })
      .mockResolvedValueOnce({
        items: [session('session-1', 'Page one')],
        nextCursor: 'opaque+/=',
      });

    renderPage(api);
    await screen.findByRole('heading', { name: 'Page one' });

    await user.click(screen.getByRole('button', { name: /trang sau/i }));
    expect(await screen.findByRole('heading', { name: 'Page two' })).toBeVisible();
    expect(api.listSessions).toHaveBeenNthCalledWith(2, {
      pageSize: 6,
      cursor: 'opaque+/=',
    });

    await user.click(screen.getByRole('button', { name: /trang trước/i }));
    expect(await screen.findByRole('heading', { name: 'Page one' })).toBeVisible();
  });

  it('shows the create CTA to a USER session', async () => {
    const api = createApi();
    api.listSessions = vi.fn().mockResolvedValue({ items: [], nextCursor: null });
    setSession('USER');

    renderPage(api);

    expect(await screen.findByRole('link', { name: /tạo phiên đấu giá/i }))
      .toHaveAttribute('href', '/auctions/create');
  });
});
