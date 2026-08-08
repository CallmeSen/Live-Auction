import { describe, expect, it, vi } from 'vitest';
import type { ServerlessRestClient } from './restClient';
import { createCatalogApi } from './catalogApi';

function envelope<T>(data: T) {
  return {
    status: 200,
    code: 'OK',
    message: 'OK',
    data,
  };
}

function createClient() {
  const get = vi.fn();
  const post = vi.fn();
  const put = vi.fn();
  const client = {
    get,
    post,
    put,
  } as unknown as ServerlessRestClient;

  return { client, get, post, put };
}

const sessionDto = {
  session_id: 'session-1',
  title: 'Evening sale',
  description: 'Prints and books',
  status: 'LIVE',
  item_count: 2,
  start_time: 1_700_000_200,
  active_item_id: 'item-1',
  current_sequence: 1,
  created_at: 1_700_000_000,
  updated_at: 1_700_000_100,
};

const itemDto = {
  item_id: 'item-1',
  session_id: 'session-1',
  sequence_number: 1,
  name: 'Signed print',
  description: 'A numbered print',
  category_id: 'prints',
  start_price: '100.00',
  duration_s: 90,
  status: 'LIVE',
  image_keys: ['items/seller/item-1/one.jpg'],
  created_at: 1_700_000_000,
  updated_at: 1_700_000_100,
  live: {
    status: 'LIVE',
    current_price: '110.00',
    end_time: 1_700_000_300,
    extension_count: 1,
  },
};

describe('CatalogApi', () => {
  it('loads the authenticated profile through the serverless API', async () => {
    const { client, get } = createClient();
    get.mockResolvedValue(envelope({
      id: 'user-1',
      email: 'seller@example.test',
      fullName: 'Seller Example',
      phone: '+84901234567',
      role: 'USER',
      status: 'ACTIVE',
      isPrimaryAdmin: false,
      createdAt: null,
      updatedAt: null,
    }));

    await expect(createCatalogApi(client).getProfile()).resolves.toEqual({
      id: 'user-1',
      email: 'seller@example.test',
      fullName: 'Seller Example',
      phone: '+84901234567',
      role: 'USER',
      status: 'ACTIVE',
      isPrimaryAdmin: false,
      createdAt: null,
      updatedAt: null,
    });
    expect(get).toHaveBeenCalledWith('/api/v1/users/me');
  });

  it('maps session DTOs and forwards an opaque cursor unchanged', async () => {
    const { client, get } = createClient();
    get.mockResolvedValue(envelope({
      items: [sessionDto],
      next_cursor: 'opaque+/=cursor',
    }));

    const result = await createCatalogApi(client).listSessions({
      status: 'LIVE',
      pageSize: 6,
      cursor: 'previous+/=cursor',
    });

    expect(get).toHaveBeenCalledWith('/api/v1/auction-sessions', {
      params: {
        status: 'LIVE',
        pageSize: 6,
        cursor: 'previous+/=cursor',
      },
    });
    expect(result).toEqual({
      items: [{
        id: 'session-1',
        title: 'Evening sale',
        description: 'Prints and books',
        status: 'LIVE',
        itemCount: 2,
        startTime: 1_700_000_200,
        activeItemId: 'item-1',
        currentSequence: 1,
        createdAt: 1_700_000_000,
        updatedAt: 1_700_000_100,
      }],
      nextCursor: 'opaque+/=cursor',
    });
  });

  it('encodes session IDs and maps rules and nested items', async () => {
    const { client, get } = createClient();
    get.mockResolvedValue(envelope({
      session: { ...sessionDto, status: 'DRAFT' },
      rules: {
        min_increment: '5.00',
        max_increment: '500.00',
        anti_snipe_window_s: 30,
        anti_snipe_extend_s: 60,
        max_extensions: 10,
        public_history_limit: 20,
      },
      items: [{ ...itemDto, status: 'WAITING', live: undefined }],
    }));

    const result = await createCatalogApi(client).getSession('session /?#');

    expect(get).toHaveBeenCalledWith(
      '/api/v1/auction-sessions/session%20%2F%3F%23',
    );
    expect(result.rules?.minIncrement).toBe('5.00');
    expect(result.rules?.maxIncrement).toBe('500.00');
    expect(result.items[0].startPrice).toBe('100.00');
    expect(result.session.status).toBe('DRAFT');
  });

  it('uses exact camel-case item filters and keeps decimal strings', async () => {
    const { client, get } = createClient();
    get.mockResolvedValue(envelope({
      items: [{ ...itemDto, status: 'PAUSED', live: undefined }],
      next_cursor: null,
    }));

    const result = await createCatalogApi(client).listItems({
      status: 'PAUSED',
      pageSize: 5,
      cursor: 'item-cursor',
      sessionId: 'session-1',
      categoryId: 'prints',
    });

    expect(get).toHaveBeenCalledWith('/api/v1/auction-items', {
      params: {
        status: 'PAUSED',
        pageSize: 5,
        cursor: 'item-cursor',
        sessionId: 'session-1',
        categoryId: 'prints',
      },
    });
    expect(result.items[0].startPrice).toBe('100.00');
    expect(typeof result.items[0].startPrice).toBe('string');
  });

  it('maps the authoritative live item snapshot', async () => {
    const { client, get } = createClient();
    get.mockResolvedValue(envelope(itemDto));

    const result = await createCatalogApi(client).getItem('item /?#');

    expect(get).toHaveBeenCalledWith(
      '/api/v1/auction-items/item%20%2F%3F%23',
    );
    expect(result.live).toEqual({
      status: 'LIVE',
      currentPrice: '110.00',
      endTime: 1_700_000_300,
      extensionCount: 1,
    });
    expect(typeof result.live?.currentPrice).toBe('string');
  });

  it('maps bidder history using only projected Stage 3 fields', async () => {
    const { client, get } = createClient();
    get.mockResolvedValue(envelope({
      items: [{
        item_id: 'item-1',
        request_id: 'request-1',
        amount: '101.00',
        status: 'REJECTED',
        reason: 'LOW_INCREMENT',
      }],
      next_cursor: 'bid-cursor',
    }));

    const result = await createCatalogApi(client).listMyBids({
      pageSize: 20,
      cursor: 'previous-bid-cursor',
    });

    expect(get).toHaveBeenCalledWith('/api/v1/bids/my', {
      params: { pageSize: 20, cursor: 'previous-bid-cursor' },
    });
    expect(result).toEqual({
      items: [{
        itemId: 'item-1',
        requestId: 'request-1',
        amount: '101.00',
        status: 'REJECTED',
        reason: 'LOW_INCREMENT',
      }],
      nextCursor: 'bid-cursor',
    });
  });

  it('maps active categories using the category pagination contract', async () => {
    const { client, get } = createClient();
    get.mockResolvedValue(envelope({
      items: [{
        category_id: 'prints',
        name: 'Prints',
        slug: 'prints',
        status: 'ACTIVE',
        created_at: 1_700_000_000,
        updated_at: 1_700_000_100,
      }],
      next_token: 'category-cursor',
    }));

    const result = await createCatalogApi(client).listCategories({
      pageSize: 100,
      cursor: 'previous-category-cursor',
    });

    expect(get).toHaveBeenCalledWith('/api/v1/categories', {
      params: {
        pageSize: 100,
        paginationToken: 'previous-category-cursor',
      },
    });
    expect(result).toEqual({
      items: [{
        id: 'prints',
        name: 'Prints',
        slug: 'prints',
        status: 'ACTIVE',
        createdAt: 1_700_000_000,
        updatedAt: 1_700_000_100,
      }],
      nextCursor: 'category-cursor',
    });
  });

  it.each([
    ['numeric decimal', { ...itemDto, start_price: 100 }],
    ['unknown status', { ...itemDto, status: 'OPEN' }],
    ['LIVE item without live state', { ...itemDto, live: undefined }],
  ])('rejects malformed item data without echoing it: %s', async (_case, data) => {
    const { client, get } = createClient();
    get.mockResolvedValue(envelope(data));

    await expect(createCatalogApi(client).getItem('item-1')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE_DATA',
      message: 'The server returned invalid catalog data.',
    });
  });

  it('rejects malformed cursor pages', async () => {
    const { client, get } = createClient();
    get.mockResolvedValue(envelope({
      items: [],
      next_cursor: { secret: 'not-a-cursor' },
    }));

    await expect(createCatalogApi(client).listSessions({})).rejects.toMatchObject({
      code: 'INVALID_RESPONSE_DATA',
    });
  });

  it('uses exact seller mutation routes and snake-case payloads', async () => {
    const { client, post, put } = createClient();
    post
      .mockResolvedValueOnce(envelope({ session_id: 'session-1', status: 'DRAFT' }))
      .mockResolvedValueOnce(envelope({
        session_id: 'session-1',
        status: 'SCHEDULED',
        start_time: 1_800_000_000,
      }));
    put.mockResolvedValue(envelope({ session_id: 'session-1', version: 2 }));
    const api = createCatalogApi(client);

    await expect(api.createSession({
      title: 'Evening sale',
      description: 'Prints and books',
    })).resolves.toEqual({ sessionId: 'session-1', status: 'DRAFT' });
    await expect(api.putRules('session /?#', {
      min_increment: '5.00',
      max_increment: '500.00',
      anti_snipe_window_s: 30,
      anti_snipe_extend_s: 60,
      max_extensions: 10,
      public_history_limit: 20,
    })).resolves.toEqual({ sessionId: 'session-1', version: 2 });
    await expect(api.scheduleSession('session /?#', {
      start_time: 1_800_000_000,
    })).resolves.toEqual({
      sessionId: 'session-1',
      status: 'SCHEDULED',
      startTime: 1_800_000_000,
    });

    expect(post).toHaveBeenNthCalledWith(1, '/api/v1/auction-sessions', {
      title: 'Evening sale',
      description: 'Prints and books',
    });
    expect(put).toHaveBeenCalledWith(
      '/api/v1/auction-sessions/session%20%2F%3F%23/rules',
      {
        min_increment: '5.00',
        max_increment: '500.00',
        anti_snipe_window_s: 30,
        anti_snipe_extend_s: 60,
        max_extensions: 10,
        public_history_limit: 20,
      },
    );
    expect(post).toHaveBeenNthCalledWith(
      2,
      '/api/v1/auction-sessions/session%20%2F%3F%23/schedule',
      { start_time: 1_800_000_000 },
    );
  });

  it('lists seller-owned sessions through the mine route with an opaque cursor', async () => {
    const { client, get } = createClient();
    get.mockResolvedValue(envelope({
      items: [{ ...sessionDto, status: 'DRAFT', seller_sub: 'seller-1', version: 2 }],
      next_cursor: 'mine+/=cursor',
    }));

    const result = await createCatalogApi(client).listMySessions({
      pageSize: 12,
      cursor: 'previous+/=',
    });

    expect(get).toHaveBeenCalledWith('/api/v1/auction-sessions/mine', {
      params: { pageSize: 12, cursor: 'previous+/=' },
    });
    expect(result.nextCursor).toBe('mine+/=cursor');
    expect(result.items[0]).toMatchObject({
      id: 'session-1',
      status: 'DRAFT',
      sellerSub: 'seller-1',
      version: 2,
    });
  });

  it('rejects a seller page that repeats the request cursor', async () => {
    const { client, get } = createClient();
    get.mockResolvedValue(envelope({ items: [], next_cursor: 'same-cursor' }));

    await expect(createCatalogApi(client).listMySessions({
      cursor: 'same-cursor',
    })).rejects.toMatchObject({ code: 'INVALID_RESPONSE_DATA' });
  });

  it('creates an item and presigns media through exact serverless routes', async () => {
    const { client, post } = createClient();
    post
      .mockResolvedValueOnce(envelope({
        item_id: 'item-1',
        status: 'WAITING',
        version: 1,
      }))
      .mockResolvedValueOnce(envelope({
        url: 'https://media.example.test',
        fields: {
          key: 'items/seller/item-1/image.png',
          policy: 'signed-policy',
        },
        object_key: 'items/seller/item-1/image.png',
        expires_in: 300,
      }));
    const api = createCatalogApi(client);

    await expect(api.createItem('session /?#', {
      name: 'Signed print',
      description: 'Numbered print',
      category_id: 'prints',
      sequence_number: 1,
      start_price: '100.00',
      duration_s: 90,
    })).resolves.toEqual({ itemId: 'item-1', status: 'WAITING', version: 1 });
    await expect(api.presignItemImage('item /?#', {
      content_type: 'image/png',
      size_bytes: 1024,
    })).resolves.toEqual({
      url: 'https://media.example.test',
      fields: {
        key: 'items/seller/item-1/image.png',
        policy: 'signed-policy',
      },
      objectKey: 'items/seller/item-1/image.png',
      expiresIn: 300,
    });

    expect(post).toHaveBeenNthCalledWith(
      1,
      '/api/v1/auction-sessions/session%20%2F%3F%23/items',
      {
        name: 'Signed print',
        description: 'Numbered print',
        category_id: 'prints',
        sequence_number: 1,
        start_price: '100.00',
        duration_s: 90,
      },
    );
    expect(post).toHaveBeenNthCalledWith(
      2,
      '/api/v1/auction-items/item%20%2F%3F%23/images/presign',
      { content_type: 'image/png', size_bytes: 1024 },
    );
  });

  it('rejects an empty created item identifier', async () => {
    const { client, post } = createClient();
    post.mockResolvedValue(envelope({
      item_id: '',
      status: 'WAITING',
      version: 1,
    }));

    await expect(createCatalogApi(client).createItem('session-1', {
      name: 'Signed print',
      description: '',
      category_id: null,
      sequence_number: 1,
      start_price: '0',
      duration_s: 90,
    })).rejects.toMatchObject({ code: 'INVALID_RESPONSE_DATA' });
  });

  it.each([
    {
      url: '',
      fields: { key: 'items/seller/item-1/image.png' },
      object_key: 'items/seller/item-1/image.png',
      expires_in: 300,
    },
    {
      url: 'http://media.example.test',
      fields: { key: 'items/seller/item-1/image.png' },
      object_key: 'items/seller/item-1/image.png',
      expires_in: 300,
    },
    {
      url: 'https://media.example.test',
      fields: {},
      object_key: 'items/seller/item-1/image.png',
      expires_in: 300,
    },
    {
      url: 'https://media.example.test',
      fields: { policy: 'signed-policy' },
      object_key: 'items/seller/item-1/image.png',
      expires_in: 300,
    },
    {
      url: 'https://media.example.test',
      fields: { key: 'items/seller/item-1/different.png' },
      object_key: 'items/seller/item-1/image.png',
      expires_in: 300,
    },
    {
      url: 'https://media.example.test',
      fields: { key: 'items/seller/item-1/image.png' },
      object_key: '',
      expires_in: 300,
    },
    {
      url: 'https://media.example.test',
      fields: { key: 'items/seller/item-1/image.png' },
      object_key: 'items/seller/item-1/image.png',
      expires_in: 0,
    },
  ])('rejects unsafe or incomplete presign data: %#', async (data) => {
    const { client, post } = createClient();
    post.mockResolvedValue(envelope(data));

    await expect(createCatalogApi(client).presignItemImage('item-1', {
      content_type: 'image/png',
      size_bytes: 1024,
    })).rejects.toMatchObject({ code: 'INVALID_RESPONSE_DATA' });
  });
});
