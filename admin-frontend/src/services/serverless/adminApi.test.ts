import { describe, expect, it, vi } from 'vitest';
import type { ServerlessRestClient } from './restClient';

const runtimeEnvironment = {
  MODE: 'test',
  VITE_AWS_REGION: 'ap-southeast-1',
  VITE_COGNITO_USER_POOL_ID: 'ap-southeast-1_example',
  VITE_COGNITO_CLIENT_ID: 'client-example',
  VITE_REST_API_URL: 'http://localhost:3000/prod',
  VITE_REST_API_KEY: 'quota-key',
  VITE_USER_APP_URL: 'http://localhost:5173',
};

for (const [name, value] of Object.entries(runtimeEnvironment)) {
  vi.stubEnv(name, value);
}

const { createAdminApi } = await import('./adminApi');

function client(): ServerlessRestClient {
  return {
    get: vi.fn().mockResolvedValue({ status: 200, code: 'OK', message: 'ok', data: { items: [] } }),
    post: vi.fn().mockResolvedValue({ status: 200, code: 'OK', message: 'ok', data: { item_id: 'item-1' } }),
    put: vi.fn(),
    patch: vi.fn().mockResolvedValue({ status: 200, code: 'OK', message: 'ok', data: {} }),
  } as ServerlessRestClient;
}

describe('admin serverless API routes', () => {
  it('uses only the Stage 3 session and item query routes', async () => {
    const rest = client();
    const api = createAdminApi(rest);

    await api.listSessions({ status: 'LIVE', pageSize: 10, cursor: 'next' });
    await api.getSession('session/1');
    await api.listItems({ status: 'PENDING_ADMIN_APPROVAL', sessionId: 'session-1' });
    await api.getItem('item/1');

    expect(rest.get).toHaveBeenNthCalledWith(1, '/api/v1/auction-sessions', {
      params: { status: 'LIVE', pageSize: 10, cursor: 'next' },
    });
    expect(rest.get).toHaveBeenNthCalledWith(2, '/api/v1/auction-sessions/session%2F1');
    expect(rest.get).toHaveBeenNthCalledWith(3, '/api/v1/auction-items', {
      params: { status: 'PENDING_ADMIN_APPROVAL', sessionId: 'session-1' },
    });
    expect(rest.get).toHaveBeenNthCalledWith(4, '/api/v1/auction-items/item%2F1');
  });

  it('uses only the existing admin item commands', async () => {
    const rest = client();
    const api = createAdminApi(rest);

    await api.commandItem('item-1', 'approve', { reason: 'reviewed' });
    await api.commandItem('item-1', 'close');

    expect(rest.post).toHaveBeenNthCalledWith(
      1,
      '/api/v1/admin/items/item-1/approve',
      { reason: 'reviewed' },
    );
    expect(rest.post).toHaveBeenNthCalledWith(
      2,
      '/api/v1/admin/items/item-1/close',
      {},
    );
  });

  it('uses the Admin session moderation and bounded dashboard routes', async () => {
    const rest = client();
    const api = createAdminApi(rest);

    await api.listAdminSessions({ status: 'SCHEDULED', reviewStatus: 'PENDING', pageSize: 10 });
    await api.getAdminSession('session/1');
    await api.commandSession('session/1', 'approve');
    await api.getDashboard();

    expect(rest.get).toHaveBeenNthCalledWith(1, '/api/v1/admin/auction-sessions', {
      params: { status: 'SCHEDULED', reviewStatus: 'PENDING', pageSize: 10 },
    });
    expect(rest.get).toHaveBeenNthCalledWith(2, '/api/v1/admin/auction-sessions/session%2F1');
    expect(rest.post).toHaveBeenCalledWith('/api/v1/admin/auction-sessions/session%2F1/approve', {});
    expect(rest.get).toHaveBeenNthCalledWith(3, '/api/v1/admin/dashboard');
  });

  it('uses the serverless admin user routes and status command', async () => {
    const rest = client();
    const api = createAdminApi(rest);

    await api.listUsers({ keyword: 'user@example.test', status: 'ACTIVE' });
    await api.getUser('user/sub');
    await api.updateUserStatus('user/sub', 'BANNED');

    expect(rest.get).toHaveBeenNthCalledWith(1, '/api/v1/admin/users', {
      params: { keyword: 'user@example.test', status: 'ACTIVE' },
    });
    expect(rest.get).toHaveBeenNthCalledWith(2, '/api/v1/admin/users/user%2Fsub');
    expect(rest.patch).toHaveBeenCalledWith(
      '/api/v1/admin/users/user%2Fsub/status',
      { status: 'BANNED' },
    );
  });

  it('uses the Admin account and category lifecycle routes', async () => {
    const rest = client();
    const api = createAdminApi(rest);

    await api.listAdminAccounts({ status: 'ACTIVE', pageSize: 10 });
    await api.createAdminAccount({ email: 'admin@example.test', full_name: 'New Admin' });
    await api.updateAdminAccountStatus('admin/sub', 'BANNED');
    await api.resetAdminInvitation('admin/sub');
    await api.listAdminCategories({ status: 'INACTIVE', keyword: 'art' });
    await api.createAdminCategory({ name: 'Fine Art' });
    await api.updateAdminCategory('category/sub', { name: 'Jewelry' });
    await api.archiveAdminCategory('category/sub');

    expect(rest.get).toHaveBeenNthCalledWith(1, '/api/v1/admin/admin-accounts', {
      params: { status: 'ACTIVE', pageSize: 10 },
    });
    expect(rest.post).toHaveBeenNthCalledWith(
      1,
      '/api/v1/admin/admin-accounts',
      { email: 'admin@example.test', full_name: 'New Admin' },
    );
    expect(rest.patch).toHaveBeenNthCalledWith(
      1,
      '/api/v1/admin/admin-accounts/admin%2Fsub/status',
      { status: 'BANNED' },
    );
    expect(rest.post).toHaveBeenNthCalledWith(
      2,
      '/api/v1/admin/admin-accounts/admin%2Fsub/reset-invitation',
      {},
    );
    expect(rest.get).toHaveBeenNthCalledWith(2, '/api/v1/admin/categories', {
      params: { status: 'INACTIVE', keyword: 'art' },
    });
    expect(rest.post).toHaveBeenNthCalledWith(
      3,
      '/api/v1/admin/categories',
      { name: 'Fine Art' },
    );
    expect(rest.patch).toHaveBeenNthCalledWith(
      2,
      '/api/v1/admin/categories/category%2Fsub',
      { name: 'Jewelry' },
    );
    expect(rest.post).toHaveBeenNthCalledWith(
      4,
      '/api/v1/admin/categories/category%2Fsub/archive',
      {},
    );
  });

  it('uses the audit history route with typed filters', async () => {
    const rest = client();
    const api = createAdminApi(rest);

    await api.listAuditEvents({
      actorSub: 'admin-sub',
      action: 'CATEGORY_CREATED',
      resourceType: 'CATEGORY',
      outcome: 'SUCCESS',
      from: 100,
      to: 200,
      pageSize: 20,
    });

    expect(rest.get).toHaveBeenCalledWith('/api/v1/admin/audit-events', {
      params: {
        actorSub: 'admin-sub',
        action: 'CATEGORY_CREATED',
        resourceType: 'CATEGORY',
        outcome: 'SUCCESS',
        from: 100,
        to: 200,
        pageSize: 20,
      },
    });
  });
});
