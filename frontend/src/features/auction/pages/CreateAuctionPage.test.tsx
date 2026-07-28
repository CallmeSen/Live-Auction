import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { CatalogApi } from '../../../services/serverless/catalogApi';
import { ServerlessApiError } from '../../../services/serverless/contracts';

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
  },
}));

import CreateAuctionPage from './CreateAuctionPage';

function createApi() {
  return {
    listSessions: vi.fn(),
    getSession: vi.fn(),
    listItems: vi.fn(),
    getItem: vi.fn(),
    listMyBids: vi.fn(),
    createSession: vi.fn(),
    putRules: vi.fn(),
    listMySessions: vi.fn(),
    scheduleSession: vi.fn(),
  } as unknown as CatalogApi;
}

function renderPage(api: CatalogApi) {
  return render(
    <MemoryRouter>
      <CreateAuctionPage catalogApi={api} />
    </MemoryRouter>,
  );
}

async function fillRequiredForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Tên phiên'), 'Evening sale');
  await user.type(screen.getByLabelText('Mô tả'), 'Prints and books');
}

describe('CreateAuctionPage', () => {
  it('creates the draft before saving bounded snake-case rules', async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.createSession = vi.fn().mockResolvedValue({
      sessionId: 'session-1',
      status: 'DRAFT',
    });
    api.putRules = vi.fn().mockResolvedValue({ sessionId: 'session-1', version: 2 });
    renderPage(api);

    await fillRequiredForm(user);
    await user.click(screen.getByRole('button', { name: 'Tạo bản nháp' }));

    await waitFor(() => expect(api.putRules).toHaveBeenCalledTimes(1));
    expect(api.createSession).toHaveBeenCalledWith({
      title: 'Evening sale',
      description: 'Prints and books',
    });
    expect(api.putRules).toHaveBeenCalledWith('session-1', {
      min_increment: '1',
      max_increment: '1000',
      anti_snipe_window_s: 30,
      anti_snipe_extend_s: 60,
      max_extensions: 10,
      public_history_limit: 20,
    });
    expect(vi.mocked(api.createSession).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(api.putRules).mock.invocationCallOrder[0]);
    expect(await screen.findByRole('link', { name: /thêm vật phẩm/i }))
      .toHaveAttribute('href', '/auction-sessions/session-1/items/create');
  });

  it('retries a partial rules failure without creating another session', async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.createSession = vi.fn().mockResolvedValue({
      sessionId: 'session-1',
      status: 'DRAFT',
    });
    api.putRules = vi.fn()
      .mockRejectedValueOnce(new Error('private-header'))
      .mockResolvedValueOnce({ sessionId: 'session-1', version: 2 });
    renderPage(api);

    await fillRequiredForm(user);
    await user.click(screen.getByRole('button', { name: 'Tạo bản nháp' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /đã tạo.*chưa lưu được quy tắc/i,
    );
    expect(screen.queryByText(/private-header/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /thử lưu lại quy tắc/i }));

    await waitFor(() => expect(api.putRules).toHaveBeenCalledTimes(2));
    expect(api.createSession).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('link', { name: /thêm vật phẩm/i })).toBeVisible();
  });

  it('rejects an invalid increment range before making a request', async () => {
    const user = userEvent.setup();
    const api = createApi();
    renderPage(api);

    await fillRequiredForm(user);
    await user.clear(screen.getByLabelText('Bước giá tối thiểu'));
    await user.type(screen.getByLabelText('Bước giá tối thiểu'), '100');
    await user.clear(screen.getByLabelText('Bước giá tối đa'));
    await user.type(screen.getByLabelText('Bước giá tối đa'), '50');
    await user.click(screen.getByRole('button', { name: 'Tạo bản nháp' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /bước giá tối đa phải lớn hơn hoặc bằng/i,
    );
    expect(api.createSession).not.toHaveBeenCalled();
    expect(api.putRules).not.toHaveBeenCalled();
  });

  it.each([
    ['network failure', new ServerlessApiError(
      0,
      'NETWORK_ERROR',
      'The request could not be completed.',
    )],
    ['malformed server response', new ServerlessApiError(
      500,
      'INVALID_ENVELOPE',
      'The server returned an invalid response.',
    )],
  ])('blocks a duplicate create attempt after an unknown %s', async (_case, failure) => {
    const user = userEvent.setup();
    const api = createApi();
    api.createSession = vi.fn().mockRejectedValue(failure);
    renderPage(api);

    await fillRequiredForm(user);
    await user.click(screen.getByRole('button', { name: 'Tạo bản nháp' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /kết quả tạo bản nháp chưa xác định/i,
    );
    expect(screen.getByRole('link', { name: /kiểm tra danh sách phiên/i }))
      .toHaveAttribute('href', '/my-auctions');
    expect(screen.getByRole('button', { name: /chờ xác minh/i })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /chờ xác minh/i }));
    expect(api.createSession).toHaveBeenCalledTimes(1);
  });
});
