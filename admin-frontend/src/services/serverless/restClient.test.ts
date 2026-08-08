import axios from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { createRestClient } from './restClient';

const config = {
  region: 'ap-southeast-1',
  userPoolId: 'pool',
  userPoolClientId: 'client',
  restApiUrl: 'https://api.example.test/prod',
  restApiKey: 'secret-api-key',
  userAppUrl: 'https://user.example.test',
};

function adapterFor(body: unknown, status = 200) {
  return vi.fn(async (request) => ({
    data: body,
    status,
    statusText: String(status),
    headers: {},
    config: request,
  }));
}

describe('admin serverless REST client', () => {
  it('sends the Cognito ID token and API key and validates envelopes', async () => {
    const adapter = adapterFor({
      status: 200,
      code: 'OK',
      message: 'ok',
      data: { id: 'item-1' },
    });
    const client = createRestClient(
      config,
      vi.fn().mockResolvedValue('id-token'),
      vi.fn(),
      adapter,
    );

    await expect(client.get<{ id: string }>('/api/v1/auction-items/item-1'))
      .resolves.toMatchObject({ data: { id: 'item-1' } });
    const request = adapter.mock.calls[0][0];
    expect(request.headers.Authorization).toBe('Bearer id-token');
    expect(request.headers['x-api-key']).toBe('secret-api-key');
    expect(request.url).toBe('/api/v1/auction-items/item-1');
  });

  it('returns bounded typed errors and handles unauthorized responses', async () => {
    const onUnauthorized = vi.fn();
    const adapter = adapterFor({
      status: 401,
      code: 'secret-api-key-auth-failed',
      message: 'Bearer id-token secret-api-key leaked',
      data: null,
    }, 401);
    const client = createRestClient(
      config,
      vi.fn().mockResolvedValue('id-token'),
      onUnauthorized,
      adapter,
    );

    await expect(client.get('/api/v1/auction-items')).rejects.toMatchObject({
      status: 401,
      code: 'SERVER_ERROR',
      message: 'The server returned an error.',
    });
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('rejects missing tokens before an API request is sent', async () => {
    const adapter = adapterFor({});
    const client = createRestClient(
      config,
      vi.fn().mockRejectedValue(new Error('no session')),
      vi.fn(),
      adapter,
    );

    await expect(client.get('/api/v1/auction-items')).rejects.toMatchObject({
      code: 'AUTH_TOKEN_UNAVAILABLE',
    });
    expect(adapter).not.toHaveBeenCalled();
  });

  it('normalizes a malformed server response', async () => {
    const client = createRestClient(
      config,
      vi.fn().mockResolvedValue('id-token'),
      vi.fn(),
      adapterFor({ unexpected: true }),
    );

    await expect(client.get('/api/v1/auction-items')).rejects.toMatchObject({
      code: 'INVALID_ENVELOPE',
      message: 'The server returned an invalid response.',
    });
    expect(axios.isAxiosError(new Error())).toBe(false);
  });
});
