import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServerlessApiError } from '../../../services/serverless/contracts';
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

import MyAuctionsPage from './MyAuctionsPage';

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

const draft = {
  id: 'session-1',
  title: 'Evening sale',
  description: 'Prints and books',
  status: 'DRAFT' as const,
  itemCount: 1,
  sellerSub: 'seller-1',
  version: 2,
  createdAt: 1_700_000_000,
  updatedAt: 1_700_000_100,
};

function renderPage(api: CatalogApi) {
  return render(
    <MemoryRouter>
      <MyAuctionsPage catalogApi={api} />
    </MemoryRouter>,
  );
}

describe('MyAuctionsPage', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('lists owned drafts and schedules with a future epoch payload', async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.listMySessions = vi.fn().mockResolvedValue({ items: [draft], nextCursor: null });
    api.scheduleSession = vi.fn().mockResolvedValue({
      sessionId: 'session-1',
      status: 'SCHEDULED',
      startTime: 1_800_000_000,
    });
    renderPage(api);

    expect(await screen.findByRole('heading', { name: 'Evening sale' })).toBeVisible();
    expect(screen.getByText(/múi giờ:/i)).toBeVisible();
    await user.type(screen.getByLabelText('Thời gian bắt đầu'), '2027-01-15T08:00');
    await user.click(screen.getByRole('button', { name: 'Lập lịch' }));

    await waitFor(() => expect(api.scheduleSession).toHaveBeenCalledTimes(1));
    const expectedEpoch = Math.floor(new Date('2027-01-15T08:00').getTime() / 1000);
    expect(api.scheduleSession).toHaveBeenCalledWith('session-1', {
      start_time: expectedEpoch,
    });
    expect(await screen.findByText('SCHEDULED')).toBeVisible();
  });

  it('rejects a past schedule locally', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-08-03T12:00:00'));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const api = createApi();
    api.listMySessions = vi.fn().mockResolvedValue({ items: [draft], nextCursor: null });
    renderPage(api);

    await screen.findByRole('heading', { name: 'Evening sale' });
    await user.type(screen.getByLabelText('Thời gian bắt đầu'), '2026-08-03T11:00');
    await user.click(screen.getByRole('button', { name: 'Lập lịch' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/phải ở tương lai/i);
    expect(api.scheduleSession).not.toHaveBeenCalled();
  });

  it('renders the sanitized backend conflict code', async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.listMySessions = vi.fn().mockResolvedValue({ items: [draft], nextCursor: null });
    api.scheduleSession = vi.fn().mockRejectedValue(
      new ServerlessApiError(409, 'SESSION_MISSING_RULES', 'Session rules are required'),
    );
    renderPage(api);

    await screen.findByRole('heading', { name: 'Evening sale' });
    await user.type(screen.getByLabelText('Thời gian bắt đầu'), '2027-01-15T08:00');
    await user.click(screen.getByRole('button', { name: 'Lập lịch' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('SESSION_MISSING_RULES');
  });

  it('guards synchronously against duplicate schedule submissions', async () => {
    const user = userEvent.setup();
    let resolveSchedule: ((value: {
      sessionId: string;
      status: 'SCHEDULED';
      startTime: number;
    }) => void) | undefined;
    const pending = new Promise<{
      sessionId: string;
      status: 'SCHEDULED';
      startTime: number;
    }>((resolve) => {
      resolveSchedule = resolve;
    });
    const api = createApi();
    api.listMySessions = vi.fn().mockResolvedValue({ items: [draft], nextCursor: null });
    api.scheduleSession = vi.fn().mockReturnValue(pending);
    renderPage(api);

    await screen.findByRole('heading', { name: 'Evening sale' });
    await user.type(screen.getByLabelText('Thời gian bắt đầu'), '2027-01-15T08:00');
    const button = screen.getByRole('button', { name: 'Lập lịch' });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(api.scheduleSession).toHaveBeenCalledTimes(1);
    resolveSchedule?.({
      sessionId: 'session-1',
      status: 'SCHEDULED',
      startTime: 1_800_000_000,
    });
    expect(await screen.findByText('SCHEDULED')).toBeVisible();
  });
});
