import { describe, expect, it, vi } from 'vitest';

const mockAdminApi = vi.hoisted(() => ({
  listSessions: vi.fn(),
  listAdminSessions: vi.fn(),
  getSession: vi.fn(),
  getAdminSession: vi.fn(),
  commandSession: vi.fn(),
  getDashboard: vi.fn(),
  listItems: vi.fn(),
  getItem: vi.fn(),
  commandItem: vi.fn(),
}));

vi.mock('./adminApi', () => ({
  adminApi: mockAdminApi,
}));

const { createCatalogApi } = await import('./catalogApi');

describe('admin catalog mapping', () => {
  it('maps Stage 3 cursor responses without legacy defaults', async () => {
    mockAdminApi.listSessions.mockResolvedValueOnce({
      items: [{
        session_id: 'session-1',
        title: 'Live session',
        description: 'description',
        status: 'LIVE',
        review_status: 'APPROVED',
        item_count: 2,
        start_time: 1_700_000_000,
        created_at: 1_700_000_000,
        updated_at: 1_700_000_100,
      }],
      next_cursor: null,
    });
    mockAdminApi.listItems.mockResolvedValueOnce({ items: [], next_cursor: null });

    const api = createCatalogApi();
    await expect(api.listSessions({ pageSize: 5 })).resolves.toEqual({
      items: [{
        id: 'session-1',
        title: 'Live session',
        description: 'description',
        status: 'LIVE',
        reviewStatus: 'APPROVED',
        itemCount: 2,
        startTime: 1_700_000_000,
        createdAt: 1_700_000_000,
        updatedAt: 1_700_000_100,
      }],
      nextCursor: null,
    });
    await expect(api.listItems({ status: 'PENDING_ADMIN_APPROVAL' })).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
  });

  it('maps Admin session review status and dashboard counts', async () => {
    mockAdminApi.listAdminSessions.mockResolvedValueOnce({
      items: [{
        session_id: 'session-1', title: 'Pending', description: '', status: 'DRAFT',
        review_status: 'PENDING', item_count: 0, created_at: 1, updated_at: 2,
      }], next_token: null,
    });
    mockAdminApi.getDashboard.mockResolvedValueOnce({
      session_counts: { DRAFT: 1 }, item_counts: { PENDING_ADMIN_APPROVAL: 2 },
      recent_sessions: [], truncated: false,
    });

    const api = createCatalogApi();
    await expect(api.listAdminSessions({ reviewStatus: 'PENDING' })).resolves.toMatchObject({
      items: [{ id: 'session-1', reviewStatus: 'PENDING' }], nextCursor: null,
    });
    await expect(api.getDashboard()).resolves.toEqual({
      sessionCounts: { DRAFT: 1 }, itemCounts: { PENDING_ADMIN_APPROVAL: 2 }, recentSessions: [], truncated: false,
    });
  });

  it('maps item details and delegates only approved item commands', async () => {
    mockAdminApi.getItem.mockResolvedValueOnce({
      item_id: 'item-1',
      session_id: 'session-1',
      sequence_number: 1,
      name: 'Item one',
      description: 'description',
      category_id: null,
      start_price: '100000',
      duration_s: 60,
      status: 'PENDING_ADMIN_APPROVAL',
      image_keys: [],
      created_at: 1_700_000_000,
      updated_at: 1_700_000_100,
    });
    mockAdminApi.commandItem.mockResolvedValueOnce({ item_id: 'item-1', status: 'READY' });

    const api = createCatalogApi();
    await expect(api.getItem('item-1')).resolves.toMatchObject({
      id: 'item-1',
      status: 'PENDING_ADMIN_APPROVAL',
      startPrice: '100000',
    });
    await api.commandItem('item-1', 'approve');
    expect(mockAdminApi.commandItem).toHaveBeenCalledWith('item-1', 'approve');
  });

  it('rejects malformed catalog data instead of rendering a fallback record', async () => {
    mockAdminApi.listItems.mockResolvedValueOnce({
      items: [{ item_id: 'missing-fields' }],
      next_cursor: null,
    });

    await expect(createCatalogApi().listItems()).rejects.toThrow(
      'The server returned invalid catalog data.',
    );
  });
});
