import { createRuntimeRestClient, type ServerlessRestClient } from './restClient';
import { cognitoAuthAdapter } from '../../auth/cognito';
import { runtimeConfig } from '../../config/runtime';

export type AdminItemCommand = 'pause' | 'resume' | 'approve' | 'close' | 'cancel';
export type AdminSessionCommand = 'approve' | 'reject' | 'cancel' | 'close';
export type AdminUserStatus = 'ACTIVE' | 'BANNED';
export type AdminCategoryStatus = 'ACTIVE' | 'INACTIVE';

export type AdminUser = {
  sub: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  role: 'USER' | 'ADMIN';
  status: AdminUserStatus;
  enabled: boolean;
  cognito_status: string | null;
  is_primary_admin: boolean;
  created_at: string | null;
  updated_at: string | null;
};

export type AdminUserPage = {
  items: AdminUser[];
  next_token: string | null;
};

export type AdminCategory = {
  category_id: string;
  name: string;
  slug: string;
  status: AdminCategoryStatus;
  created_at: number;
  updated_at: number;
};

export type AdminCategoryPage = {
  items: AdminCategory[];
  next_token: string | null;
};

export type AdminAccountCreate = {
  email: string;
  full_name: string;
  phone?: string;
};

export type AdminAuditEvent = {
  event_id: string;
  actor_sub: string;
  action: string;
  resource_type: string;
  resource_id: string;
  outcome: string;
  request_id: string;
  timestamp: number;
  reason?: Record<string, string>;
};

export type AdminAuditPage = {
  items: AdminAuditEvent[];
  next_token: string | null;
};

export type AdminDashboard = {
  session_counts: Record<string, number>;
  item_counts: Record<string, number>;
  recent_sessions: unknown[];
  truncated: boolean;
};

export type AdminApi = {
  listSessions(input?: {
    status?: string;
    pageSize?: number;
    cursor?: string;
  }): Promise<unknown>;
  listAdminSessions(input?: {
    status?: string;
    reviewStatus?: string;
    pageSize?: number;
    paginationToken?: string;
  }): Promise<unknown>;
  getSession(sessionId: string): Promise<unknown>;
  getAdminSession(sessionId: string): Promise<unknown>;
  commandSession(sessionId: string, command: AdminSessionCommand): Promise<unknown>;
  getDashboard(): Promise<AdminDashboard>;
  listItems(input?: {
    status?: string;
    pageSize?: number;
    cursor?: string;
    sessionId?: string;
    categoryId?: string;
  }): Promise<unknown>;
  getItem(itemId: string): Promise<unknown>;
  commandItem(itemId: string, command: AdminItemCommand, payload?: unknown): Promise<unknown>;
  listUsers(input?: {
    keyword?: string;
    role?: 'USER' | 'ADMIN';
    status?: AdminUserStatus;
    pageSize?: number;
    paginationToken?: string;
  }): Promise<AdminUserPage>;
  getUser(userId: string): Promise<AdminUser>;
  updateUserStatus(userId: string, status: AdminUserStatus): Promise<AdminUser>;
  listAdminAccounts(input?: {
    keyword?: string;
    status?: AdminUserStatus;
    pageSize?: number;
    paginationToken?: string;
  }): Promise<AdminUserPage>;
  createAdminAccount(input: AdminAccountCreate): Promise<AdminUser>;
  updateAdminAccountStatus(userId: string, status: AdminUserStatus): Promise<AdminUser>;
  resetAdminInvitation(userId: string): Promise<AdminUser>;
  listAdminCategories(input?: {
    status?: AdminCategoryStatus;
    keyword?: string;
    pageSize?: number;
    paginationToken?: string;
  }): Promise<AdminCategoryPage>;
  createAdminCategory(input: { name: string; slug?: string }): Promise<AdminCategory>;
  updateAdminCategory(inputId: string, input: {
    name?: string;
    slug?: string;
    status?: AdminCategoryStatus;
  }): Promise<AdminCategory>;
  archiveAdminCategory(inputId: string): Promise<AdminCategory>;
  listAuditEvents(input?: {
    actorSub?: string;
    action?: string;
    resourceType?: string;
    outcome?: string;
    from?: number;
    to?: number;
    pageSize?: number;
    paginationToken?: string;
  }): Promise<AdminAuditPage>;
};

function clientOrDefault(client?: ServerlessRestClient): ServerlessRestClient {
  return client ?? createRuntimeRestClient(
    runtimeConfig,
    () => cognitoAuthAdapter.idToken(),
    () => cognitoAuthAdapter.signOut(),
  );
}

export function createAdminApi(client?: ServerlessRestClient): AdminApi {
  const restClient = clientOrDefault(client);
  return {
    async listSessions(input = {}) {
      return (await restClient.get<unknown>('/api/v1/auction-sessions', {
        params: input,
      })).data;
    },
    async listAdminSessions(input = {}) {
      return (await restClient.get<unknown>('/api/v1/admin/auction-sessions', {
        params: input,
      })).data;
    },
    async getSession(sessionId) {
      return (await restClient.get<unknown>(
        `/api/v1/auction-sessions/${encodeURIComponent(sessionId)}`,
      )).data;
    },
    async getAdminSession(sessionId) {
      return (await restClient.get<unknown>(
        `/api/v1/admin/auction-sessions/${encodeURIComponent(sessionId)}`,
      )).data;
    },
    async commandSession(sessionId, command) {
      return (await restClient.post<unknown>(
        `/api/v1/admin/auction-sessions/${encodeURIComponent(sessionId)}/${command}`,
        {},
      )).data;
    },
    async getDashboard() {
      return (await restClient.get<AdminDashboard>('/api/v1/admin/dashboard')).data;
    },
    async listItems(input = {}) {
      return (await restClient.get<unknown>('/api/v1/auction-items', {
        params: input,
      })).data;
    },
    async getItem(itemId) {
      return (await restClient.get<unknown>(
        `/api/v1/auction-items/${encodeURIComponent(itemId)}`,
      )).data;
    },
    async commandItem(itemId, command, payload = {}) {
      return (await restClient.post<unknown>(
        `/api/v1/admin/items/${encodeURIComponent(itemId)}/${command}`,
        payload,
      )).data;
    },
    async listUsers(input = {}) {
      return (await restClient.get<AdminUserPage>('/api/v1/admin/users', {
        params: input,
      })).data;
    },
    async getUser(userId) {
      return (await restClient.get<AdminUser>(
        `/api/v1/admin/users/${encodeURIComponent(userId)}`,
      )).data;
    },
    async updateUserStatus(userId, status) {
      return (await restClient.patch<AdminUser>(
        `/api/v1/admin/users/${encodeURIComponent(userId)}/status`,
        { status },
      )).data;
    },
    async listAdminAccounts(input = {}) {
      return (await restClient.get<AdminUserPage>('/api/v1/admin/admin-accounts', {
        params: input,
      })).data;
    },
    async createAdminAccount(input) {
      return (await restClient.post<AdminUser>('/api/v1/admin/admin-accounts', input)).data;
    },
    async updateAdminAccountStatus(userId, status) {
      return (await restClient.patch<AdminUser>(
        `/api/v1/admin/admin-accounts/${encodeURIComponent(userId)}/status`,
        { status },
      )).data;
    },
    async resetAdminInvitation(userId) {
      return (await restClient.post<AdminUser>(
        `/api/v1/admin/admin-accounts/${encodeURIComponent(userId)}/reset-invitation`,
        {},
      )).data;
    },
    async listAdminCategories(input = {}) {
      return (await restClient.get<AdminCategoryPage>('/api/v1/admin/categories', {
        params: input,
      })).data;
    },
    async createAdminCategory(input) {
      return (await restClient.post<AdminCategory>('/api/v1/admin/categories', input)).data;
    },
    async updateAdminCategory(inputId, input) {
      return (await restClient.patch<AdminCategory>(
        `/api/v1/admin/categories/${encodeURIComponent(inputId)}`,
        input,
      )).data;
    },
    async archiveAdminCategory(inputId) {
      return (await restClient.post<AdminCategory>(
        `/api/v1/admin/categories/${encodeURIComponent(inputId)}/archive`,
        {},
      )).data;
    },
    async listAuditEvents(input = {}) {
      return (await restClient.get<AdminAuditPage>('/api/v1/admin/audit-events', {
        params: input,
      })).data;
    },
  };
}

export const adminApi = createAdminApi();
