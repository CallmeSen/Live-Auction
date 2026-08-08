import {
  AxiosError,
  CanceledError,
  type AxiosAdapter,
  type AxiosResponse,
} from 'axios';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { RuntimeConfig } from '../../config/runtime';
import { ServerlessApiError, type ApiEnvelope } from './contracts';
import {
  createRestClient,
  type ServerlessRestClient,
} from './restClient';

const config: RuntimeConfig = {
  region: 'ap-southeast-1',
  userPoolId: 'pool-id',
  userPoolClientId: 'client-id',
  restApiUrl: 'https://rest.example.test/prod',
  restApiKey: 'api-key-secret',
  websocketUrl: 'wss://socket.example.test/prod',
  mediaBaseUrl: 'https://media.example.test',
};

function response<T>(
  request: Parameters<AxiosAdapter>[0],
  data: T,
  status = 200,
): AxiosResponse<T> {
  return {
    data,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: {},
    config: request,
  };
}

function rejectedResponse(
  request: Parameters<AxiosAdapter>[0],
  data: unknown,
  status: number,
): Promise<never> {
  return Promise.reject(
    new AxiosError(
      'Request failed',
      'ERR_BAD_REQUEST',
      request,
      undefined,
      response(request, data, status),
    ),
  );
}

function clientWithAdapter(
  adapter: AxiosAdapter,
  getIdToken: () => Promise<string> = async () => 'current-id-token',
  onUnauthorized: () => void | Promise<void> = vi.fn(),
) {
  return createRestClient(config, getIdToken, onUnauthorized, adapter);
}

function assertTypedClientSurface(client: ServerlessRestClient): void {
  expectTypeOf(client.get<{ id: string }>('/items/item-1')).toEqualTypeOf<
    Promise<ApiEnvelope<{ id: string }>>
  >();
  expectTypeOf(client.post<{ id: string }>('/items', { name: 'Watch' })).toEqualTypeOf<
    Promise<ApiEnvelope<{ id: string }>>
  >();
  expectTypeOf(client.put<{ id: string }>('/items/item-1', { name: 'Watch' })).toEqualTypeOf<
    Promise<ApiEnvelope<{ id: string }>>
  >();

  // @ts-expect-error Authentication headers are owned by the REST client.
  void client.get('/items', { headers: { Authorization: 'Bearer attacker-token' } });
}

void assertTypedClientSurface;

describe('serverless REST client', () => {
  it('sends the current ID token, lowercase API key, and Accept header on every request', async () => {
    let token = 'first-id-token';
    const requests: Parameters<AxiosAdapter>[0][] = [];
    const adapter: AxiosAdapter = async (request) => {
      requests.push(request);
      return response(request, {
        status: 200,
        code: 'OK',
        message: 'ok',
        data: { requestCount: requests.length },
      });
    };
    const client = clientWithAdapter(adapter, async () => token);

    await client.get('/one');
    token = 'second-id-token';
    await client.get('/two');

    expect(requests).toHaveLength(2);
    expect(requests[0].headers.get('Authorization')).toBe(
      'Bearer first-id-token',
    );
    expect(requests[1].headers.get('Authorization')).toBe(
      'Bearer second-id-token',
    );
    expect(requests[0].headers.toJSON()).toMatchObject({
      'x-api-key': 'api-key-secret',
      Accept: 'application/json',
    });
    expect(Object.keys(requests[0].headers.toJSON())).toContain('x-api-key');
  });

  it('returns data from a valid API envelope', async () => {
    const adapter: AxiosAdapter = async (request) => response(request, {
      status: 200,
      code: 'OK',
      message: 'loaded',
      data: { id: 'item-1' },
    });
    const client = clientWithAdapter(adapter);

    const result = await client.get<{ id: string }>('/items/item-1');

    expect(result).toEqual({
      status: 200,
      code: 'OK',
      message: 'loaded',
      data: { id: 'item-1' },
    });
  });

  it('ignores caller-supplied authentication headers at runtime', async () => {
    let receivedRequest: Parameters<AxiosAdapter>[0] | undefined;
    const adapter: AxiosAdapter = async (request) => {
      receivedRequest = request;
      return response(request, {
        status: 200,
        code: 'OK',
        message: 'ok',
        data: null,
      });
    };
    const client = clientWithAdapter(adapter);
    const unsafeGet = client.get as unknown as (
      url: string,
      requestConfig: { headers: Record<string, string> },
    ) => Promise<ApiEnvelope<null>>;

    await unsafeGet('/items', {
      headers: {
        Authorization: 'Bearer attacker-token',
        'x-api-key': 'attacker-api-key',
      },
    });

    expect(receivedRequest?.headers.get('Authorization')).toBe(
      'Bearer current-id-token',
    );
    expect(receivedRequest?.headers.get('x-api-key')).toBe(config.restApiKey);
  });

  it('rejects an invalid API envelope without exposing request secrets', async () => {
    const adapter: AxiosAdapter = async (request) => response(request, {
      status: 200,
      code: 'OK',
      message: 'missing data',
    });
    const client = clientWithAdapter(adapter);

    const error = await client.get('/invalid').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ServerlessApiError);
    expect(error).toMatchObject({ status: 200, code: 'INVALID_ENVELOPE' });
    expect(String(error)).not.toContain('current-id-token');
    expect(String(error)).not.toContain('api-key-secret');
  });

  it('normalizes network Axios errors without exposing Axios request details', async () => {
    const adapter: AxiosAdapter = async (request) => {
      throw new AxiosError(
        `network failure for current-id-token and ${config.restApiKey}`,
        'ERR_NETWORK',
        request,
      );
    };
    const client = clientWithAdapter(adapter);

    const error = await client.get('/network').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ServerlessApiError);
    expect(error).toMatchObject({
      status: 0,
      code: 'NETWORK_ERROR',
      message: 'The request could not be completed.',
    });
    expect(error).not.toHaveProperty('config');
    expect(error).not.toHaveProperty('request');
    expect(error).not.toHaveProperty('response');
    expect(String(error)).not.toContain('current-id-token');
    expect(String(error)).not.toContain(config.restApiKey);
  });

  it('reports an aborted request as cancellation rather than a network failure', async () => {
    const adapter: AxiosAdapter = async (request) => {
      throw new CanceledError(
        `cancelled current-id-token and ${config.restApiKey}`,
        request,
      );
    };
    const client = clientWithAdapter(adapter);

    const error = await client.get('/cancelled').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ServerlessApiError);
    expect(error).toMatchObject({
      status: 0,
      code: 'REQUEST_CANCELLED',
      message: 'The request was cancelled.',
    });
    expect(String(error)).not.toContain('current-id-token');
    expect(String(error)).not.toContain(config.restApiKey);
  });

  it('normalizes raw request failures without serializing the original error', async () => {
    const adapter: AxiosAdapter = async () => {
      throw new Error('raw failure contains current-id-token and api-key-secret');
    };
    const client = clientWithAdapter(adapter);

    const error = await client.get('/raw-failure').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ServerlessApiError);
    expect(error).toMatchObject({
      status: 0,
      code: 'REQUEST_FAILED',
      message: 'The request could not be completed.',
    });
    expect(error).not.toHaveProperty('config');
    expect(error).not.toHaveProperty('request');
    expect(error).not.toHaveProperty('response');
    expect(String(error)).not.toContain('current-id-token');
    expect(String(error)).not.toContain(config.restApiKey);
  });

  it('sanitizes getIdToken failures before they leave the request interceptor', async () => {
    const client = clientWithAdapter(
      vi.fn<AxiosAdapter>(),
      async () => {
        throw new Error('token failure contains current-id-token and api-key-secret');
      },
    );

    const error = await client.get('/token-failure').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ServerlessApiError);
    expect(error).toMatchObject({
      status: 0,
      code: 'AUTH_TOKEN_UNAVAILABLE',
      message: 'Unable to obtain an access token.',
    });
    expect(String(error)).not.toContain('current-id-token');
    expect(String(error)).not.toContain(config.restApiKey);
  });

  it.each([
    [401, 'AUTH_REQUIRED'],
    [403, 'FORBIDDEN'],
    [404, 'ITEM_NOT_FOUND'],
    [409, 'BID_CONFLICT'],
    [429, 'RATE_LIMITED'],
  ])(
    'preserves backend status and code for %s responses without leaking headers',
    async (status, code) => {
      const token = 'rejected-id-token';
      const adapter: AxiosAdapter = (request) => rejectedResponse(
        request,
        {
          status,
          code,
          message: 'backend message',
          data: null,
        },
        status,
      );
      const client = clientWithAdapter(adapter, async () => token);

      const error = await client.get('/protected').catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ServerlessApiError);
      expect(error).toMatchObject({
        status,
        code,
        message: 'backend message',
      });
      expect(String(error)).not.toContain(token);
      expect(String(error)).not.toContain(config.restApiKey);
    },
  );

  it('replaces a backend message that echoes request credentials with a safe message', async () => {
    const token = 'credential-id-token';
    const authorization = `Bearer ${token}`;
    const adapter: AxiosAdapter = (request) => rejectedResponse(
      request,
      {
        status: 403,
        code: 'FORBIDDEN',
        message: `Rejected ${authorization}; token=${token}; key=${config.restApiKey}`,
        data: null,
      },
      403,
    );
    const client = clientWithAdapter(adapter, async () => token);

    const error = await client.get('/protected').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ServerlessApiError);
    expect(error).toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
      message: 'The server returned an error.',
    });
    expect(String(error)).not.toContain(token);
    expect(String(error)).not.toContain(authorization);
    expect(String(error)).not.toContain(config.restApiKey);
  });

  it('replaces a backend code that echoes request credentials', async () => {
    const token = 'credential-id-token';
    const adapter: AxiosAdapter = (request) => rejectedResponse(
      request,
      {
        status: 403,
        code: `FORBIDDEN_${token}_${config.restApiKey}`,
        message: 'Request rejected.',
        data: null,
      },
      403,
    );
    const client = clientWithAdapter(adapter, async () => token);

    const error = await client.get('/protected').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ServerlessApiError);
    expect(error).toMatchObject({
      status: 403,
      code: 'SERVER_ERROR',
      message: 'The server returned an error.',
    });
    expect(String(error)).not.toContain(token);
    expect(String(error)).not.toContain(config.restApiKey);
  });

  it.each([
    ['successful', 200, 201, false],
    ['rejected', 403, 200, true],
  ])(
    'rejects a %s response when HTTP status %s differs from envelope status %s',
    async (_case, httpStatus, envelopeStatus, rejects) => {
      const adapter: AxiosAdapter = (request) => {
        const body = {
          status: envelopeStatus,
          code: 'STATUS_MISMATCH',
          message: 'mismatched response',
          data: null,
        };

        return rejects
          ? rejectedResponse(request, body, httpStatus)
          : Promise.resolve(response(request, body, httpStatus));
      };
      const client = clientWithAdapter(adapter);

      const error = await client.get('/mismatch').catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ServerlessApiError);
      expect(error).toMatchObject({
        status: httpStatus,
        code: 'INVALID_ENVELOPE',
        message: 'The server returned an invalid response.',
      });
    },
  );

  it('checks the session once and calls unauthorized only when the rejected token is still current', async () => {
    const getIdToken = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('rejected-id-token')
      .mockResolvedValueOnce('rejected-id-token');
    const onUnauthorized = vi.fn();
    const adapter: AxiosAdapter = (request) => rejectedResponse(
      request,
      {
        status: 401,
        code: 'AUTH_REQUIRED',
        message: 'authentication required',
        data: null,
      },
      401,
    );
    const client = clientWithAdapter(adapter, getIdToken, onUnauthorized);

    await expect(client.get('/protected')).rejects.toBeInstanceOf(ServerlessApiError);

    expect(getIdToken).toHaveBeenCalledTimes(2);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('deduplicates the session recheck and logout for concurrent 401 responses using the same token', async () => {
    const getIdToken = vi.fn<() => Promise<string>>().mockResolvedValue(
      'shared-rejected-id-token',
    );
    const onUnauthorized = vi.fn(async () => Promise.resolve());
    const adapter: AxiosAdapter = async (request) => {
      await Promise.resolve();
      return rejectedResponse(
        request,
        {
          status: 401,
          code: 'AUTH_REQUIRED',
          message: 'authentication required',
          data: null,
        },
        401,
      );
    };
    const client = clientWithAdapter(adapter, getIdToken, onUnauthorized);

    const results = await Promise.allSettled([
      client.get('/protected/one'),
      client.get('/protected/two'),
    ]);

    expect(results.every((result) => result.status === 'rejected')).toBe(true);
    expect(getIdToken).toHaveBeenCalledTimes(3);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('does not recheck or logout again when a same-token 401 arrives after the first handler completes', async () => {
    let releaseSecondResponse: (() => void) | undefined;
    const secondResponseGate = new Promise<void>((resolve) => {
      releaseSecondResponse = resolve;
    });
    const getIdToken = vi.fn<() => Promise<string>>().mockResolvedValue(
      'shared-rejected-id-token',
    );
    const onUnauthorized = vi.fn(async () => Promise.resolve());
    let requestCount = 0;
    const adapter: AxiosAdapter = async (request) => {
      requestCount += 1;
      if (requestCount === 2) {
        await secondResponseGate;
      }
      return rejectedResponse(
        request,
        {
          status: 401,
          code: 'AUTH_REQUIRED',
          message: 'authentication required',
          data: null,
        },
        401,
      );
    };
    const client = clientWithAdapter(adapter, getIdToken, onUnauthorized);

    const first = client.get('/protected/one');
    const second = client.get('/protected/two');
    await expect(first).rejects.toBeInstanceOf(ServerlessApiError);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    releaseSecondResponse?.();
    await expect(second).rejects.toBeInstanceOf(ServerlessApiError);

    expect(getIdToken).toHaveBeenCalledTimes(3);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('does not sign out for a stale request token and never retries the request', async () => {
    const getIdToken = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('stale-id-token')
      .mockResolvedValueOnce('new-id-token');
    const onUnauthorized = vi.fn();
    const adapter = vi.fn<AxiosAdapter>((request) => rejectedResponse(
      request,
      {
        status: 401,
        code: 'AUTH_REQUIRED',
        message: 'authentication required',
        data: null,
      },
      401,
    ));
    const client = clientWithAdapter(adapter, getIdToken, onUnauthorized);

    await expect(client.get('/protected')).rejects.toBeInstanceOf(ServerlessApiError);

    expect(adapter).toHaveBeenCalledTimes(1);
    expect(getIdToken).toHaveBeenCalledTimes(2);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('calls unauthorized when the 401 token recheck rejects and preserves the backend error', async () => {
    const backendError = {
      status: 401,
      code: 'AUTH_REQUIRED',
      message: 'authentication required',
      data: null,
    };
    const getIdToken = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('rejected-id-token')
      .mockRejectedValueOnce(new Error('token recheck failed'));
    const onUnauthorized = vi.fn().mockRejectedValue(new Error('sign out failed'));
    const adapter: AxiosAdapter = (request) => rejectedResponse(
      request,
      backendError,
      401,
    );
    const client = clientWithAdapter(adapter, getIdToken, onUnauthorized);

    const error = await client.get('/protected').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ServerlessApiError);
    expect(error).toMatchObject({
      status: backendError.status,
      code: backendError.code,
      message: backendError.message,
    });
    expect(getIdToken).toHaveBeenCalledTimes(2);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(String(error)).not.toContain('sign out failed');
  });
});
