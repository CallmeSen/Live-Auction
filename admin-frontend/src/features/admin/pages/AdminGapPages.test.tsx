import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AdminAccountsPage from './AdminAccountsPage';
import AdminCategoriesPage from './AdminCategoriesPage';
import AdminUsersPage from './AdminUsersPage';

const { mockAdminApi } = vi.hoisted(() => ({
  mockAdminApi: {
    listUsers: vi.fn().mockResolvedValue({
      items: [{
        sub: 'user-sub',
        email: 'user@example.test',
        full_name: 'User Example',
        phone: null,
        role: 'USER',
        status: 'ACTIVE',
        enabled: true,
        cognito_status: 'CONFIRMED',
        is_primary_admin: false,
        created_at: '2026-08-01T00:00:00Z',
        updated_at: '2026-08-02T00:00:00Z',
      }],
      next_token: null,
    }),
    updateUserStatus: vi.fn().mockResolvedValue({
      sub: 'user-sub',
      email: 'user@example.test',
      full_name: 'User Example',
      phone: null,
      role: 'USER',
      status: 'BANNED',
      enabled: false,
      cognito_status: 'CONFIRMED',
      is_primary_admin: false,
      created_at: '2026-08-01T00:00:00Z',
      updated_at: '2026-08-02T00:00:00Z',
    }),
    listAdminAccounts: vi.fn().mockResolvedValue({ items: [], next_token: null }),
    createAdminAccount: vi.fn(),
    updateAdminAccountStatus: vi.fn(),
    resetAdminInvitation: vi.fn(),
    listAdminCategories: vi.fn().mockResolvedValue({ items: [{ category_id: 'cat-1', name: 'Fine Art', slug: 'fine-art', status: 'ACTIVE', created_at: 100, updated_at: 100 }], next_token: null }),
    createAdminCategory: vi.fn(),
    updateAdminCategory: vi.fn(),
    archiveAdminCategory: vi.fn().mockResolvedValue({ category_id: 'cat-1', name: 'Fine Art', slug: 'fine-art', status: 'INACTIVE', created_at: 100, updated_at: 100 }),
  },
}));

vi.mock('../../../services/serverless/adminApi', () => ({ adminApi: mockAdminApi }));

describe('admin gap pages', () => {
  afterEach(() => vi.restoreAllMocks());

  it('loads users and exposes a disable action', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<AdminUsersPage />);

    expect(await screen.findByText('user@example.test')).toBeInTheDocument();
    const disable = screen.getByRole('button', { name: 'Disable' });
    expect(disable).toBeInTheDocument();
    fireEvent.click(disable);
    await waitFor(() => expect(mockAdminApi.updateUserStatus).toHaveBeenCalledWith('user-sub', 'BANNED'));
  });

  it('loads Admin accounts through the serverless API', async () => {
    render(<AdminAccountsPage />);
    expect(await screen.findByRole('heading', { name: 'Admin accounts' })).toBeInTheDocument();
    expect(mockAdminApi.listAdminAccounts).toHaveBeenCalledWith({ pageSize: 60 });
  });

  it('loads and archives categories through the serverless API', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<AdminCategoriesPage />);
    expect(await screen.findByText('Fine Art')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(mockAdminApi.archiveAdminCategory).toHaveBeenCalledWith('cat-1'));
  });
});
