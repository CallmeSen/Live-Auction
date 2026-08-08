import axios, {
  type AxiosAdapter,
  type AxiosRequestConfig,
} from 'axios';
import type { RuntimeConfig } from '../../config/runtime';
import { ServerlessApiError, type ApiEnvelope } from './contracts';

export type ServerlessRequestConfig = {
  params?: Record<string, string | number | boolean | null | undefined>;
  signal?: AbortSignal;
};

export type ServerlessRestClient = {
  get<T>(url: string, config?: ServerlessRequestConfig): Promise<ApiEnvelope<T>>;
  post<T>(url: string, data?: unknown, config?: ServerlessRequestConfig): Promise<ApiEnvelope<T>>;
  put<T>(url: string, data?: unknown, config?: ServerlessRequestConfig): Promise<ApiEnvelope<T>>;
  patch<T>(url: string, data?: unknown, config?: ServerlessRequestConfig): Promise<ApiEnvelope<T>>;
};

type RequestTokenStore = WeakMap<object, string>;

const REQUEST_FAILURE_MESSAGE = 'The request could not be completed.';
const REQUEST_CANCELLED_MESSAGE = 'The request was cancelled.';
const INVALID_ENVELOPE_MESSAGE = 'The server returned an invalid response.';
const SAFE_SERVER_ERROR_MESSAGE = 'The server returned an error.';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseEnvelope<T>(value: unknown, responseStatus: number): ApiEnvelope<T> {
  if (
    !isRecord(value)
    || typeof value.status !== 'number'
    || typeof value.code !== 'string'
    || typeof value.message !== 'string'
    || !Object.prototype.hasOwnProperty.call(value, 'data')
    || value.status !== responseStatus
  ) {
    throw new ServerlessApiError(
      responseStatus,
      'INVALID_ENVELOPE',
      INVALID_ENVELOPE_MESSAGE,
    );
  }
  return value as ApiEnvelope<T>;
}

function safeServerMessage(message: string, secrets: string[]): string {
  return secrets.some((secret) => secret !== '' && message.includes(secret))
    ? SAFE_SERVER_ERROR_MESSAGE
    : message;
}

function requestConfig(config: ServerlessRequestConfig | undefined): AxiosRequestConfig {
  return {
    ...(config?.params === undefined ? {} : { params: config.params }),
    ...(config?.signal === undefined ? {} : { signal: config.signal }),
  };
}

export function createRestClient(
  config: RuntimeConfig,
  getIdToken: () => Promise<string>,
  onUnauthorized: () => void | Promise<void>,
  adapter?: AxiosAdapter,
): ServerlessRestClient {
  const requestTokens: RequestTokenStore = new WeakMap();
  const client = axios.create({
    baseURL: config.restApiUrl,
    ...(adapter ? { adapter } : {}),
  });

  client.interceptors.request.use(async (request) => {
    let idToken: string;
    try {
      idToken = await getIdToken();
    } catch {
      throw new ServerlessApiError(
        0,
        'AUTH_TOKEN_UNAVAILABLE',
        'Unable to obtain an access token.',
      );
    }

    request.headers.Authorization = `Bearer ${idToken}`;
    request.headers['x-api-key'] = config.restApiKey;
    request.headers.Accept = 'application/json';
    requestTokens.set(request, idToken);
    return request;
  });

  client.interceptors.response.use(
    async (response) => {
      try {
        const envelope = parseEnvelope(response.data, response.status);
        if (envelope.status >= 400) {
          if (envelope.status === 401 || response.status === 401) {
            try {
              await onUnauthorized();
            } catch {
              // Keep the typed API error as the request result.
            }
          }
          throw new ServerlessApiError(
            envelope.status,
            envelope.code.includes(config.restApiKey) ? 'SERVER_ERROR' : envelope.code,
            safeServerMessage(envelope.message, [
              config.restApiKey,
              requestTokens.get(response.config) ?? '',
            ]),
          );
        }
        return response;
      } finally {
        requestTokens.delete(response.config);
      }
    },
    async (error: unknown) => {
      if (axios.isCancel(error)) {
        throw new ServerlessApiError(0, 'REQUEST_CANCELLED', REQUEST_CANCELLED_MESSAGE);
      }

      if (!axios.isAxiosError(error) || error.response === undefined) {
        throw error instanceof ServerlessApiError
          ? error
          : new ServerlessApiError(0, 'NETWORK_ERROR', REQUEST_FAILURE_MESSAGE);
      }

      const response = error.response;
      let normalized: ServerlessApiError;
      try {
        const envelope = parseEnvelope(response.data, response.status);
        normalized = new ServerlessApiError(
          envelope.status,
          envelope.code,
          safeServerMessage(envelope.message, [
            config.restApiKey,
            requestTokens.get(response.config) ?? '',
          ]),
        );
      } catch (caught) {
        normalized = caught instanceof ServerlessApiError
          ? caught
          : new ServerlessApiError(response.status, 'INVALID_ENVELOPE', INVALID_ENVELOPE_MESSAGE);
      }

      if (response.status === 401) {
        try {
          await onUnauthorized();
        } catch {
          // Keep the typed API error as the request result.
        }
      }
      requestTokens.delete(response.config);
      throw normalized;
    },
  );

  async function request<T>(
    method: 'get' | 'post' | 'put' | 'patch',
    url: string,
    data: unknown,
    config: ServerlessRequestConfig | undefined,
  ): Promise<ApiEnvelope<T>> {
    const response = await client.request<ApiEnvelope<T>>({
      ...requestConfig(config),
      method,
      url,
      ...(method === 'get' ? {} : { data }),
    });
    return response.data;
  }

  return {
    get: <T>(url: string, config?: ServerlessRequestConfig) => request<T>('get', url, undefined, config),
    post: <T>(url: string, data?: unknown, config?: ServerlessRequestConfig) => request<T>('post', url, data, config),
    put: <T>(url: string, data?: unknown, config?: ServerlessRequestConfig) => request<T>('put', url, data, config),
    patch: <T>(url: string, data?: unknown, config?: ServerlessRequestConfig) => request<T>('patch', url, data, config),
  };
}

export function createRuntimeRestClient(
  config: RuntimeConfig,
  getIdToken: () => Promise<string>,
  onUnauthorized: () => void | Promise<void>,
): ServerlessRestClient {
  return createRestClient(config, getIdToken, onUnauthorized);
}
