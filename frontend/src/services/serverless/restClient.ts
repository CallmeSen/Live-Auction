import axios, {
  type AxiosAdapter,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import type { RuntimeConfig } from '../../config/runtime';
import { ServerlessApiError, type ApiEnvelope } from './contracts';

export type UnauthorizedHandler = () => void | Promise<void>;

export type ServerlessRequestConfig = {
  params?: Record<string, string | number | boolean | null | undefined>;
  signal?: AbortSignal;
};

export type ServerlessRestClient = {
  get<T>(url: string, config?: ServerlessRequestConfig): Promise<ApiEnvelope<T>>;
  post<T>(
    url: string,
    data?: unknown,
    config?: ServerlessRequestConfig,
  ): Promise<ApiEnvelope<T>>;
  put<T>(
    url: string,
    data?: unknown,
    config?: ServerlessRequestConfig,
  ): Promise<ApiEnvelope<T>>;
};

type RequestConfig = InternalAxiosRequestConfig & object;
type RequestTokenStore = WeakMap<object, string>;

const REQUEST_FAILURE_MESSAGE = 'The request could not be completed.';
const REQUEST_CANCELLED_MESSAGE = 'The request was cancelled.';
const INVALID_ENVELOPE_MESSAGE = 'The server returned an invalid response.';
const SAFE_SERVER_ERROR_MESSAGE = 'The server returned an error.';
const MAX_HANDLED_UNAUTHORIZED_TOKENS = 4;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function invalidEnvelope(status: number): ServerlessApiError {
  return new ServerlessApiError(
    status,
    'INVALID_ENVELOPE',
    INVALID_ENVELOPE_MESSAGE,
  );
}

function parseEnvelope<T>(
  value: unknown,
  responseStatus: number,
): ApiEnvelope<T> {
  if (
    !isRecord(value)
    || typeof value.status !== 'number'
    || typeof value.code !== 'string'
    || typeof value.message !== 'string'
    || !Object.prototype.hasOwnProperty.call(value, 'data')
    || value.status !== responseStatus
  ) {
    throw invalidEnvelope(responseStatus);
  }

  return value as ApiEnvelope<T>;
}

function isUnauthorized(status: number, responseStatus: number): boolean {
  return status === 401 || responseStatus === 401;
}

function includesSecret(value: string, secrets: string[]): boolean {
  return secrets.some((secret) => secret.length > 0 && value.includes(secret));
}

function safeServerError(
  code: string,
  message: string,
  secrets: string[],
): { code: string; message: string } {
  const unsafeCode = includesSecret(code, secrets);
  const unsafeMessage = includesSecret(message, secrets);

  return {
    code: unsafeCode ? 'SERVER_ERROR' : code,
    message: unsafeCode || unsafeMessage ? SAFE_SERVER_ERROR_MESSAGE : message,
  };
}

function requestSecrets(
  request: object,
  requestTokens: RequestTokenStore,
  apiKey: string,
): string[] {
  const token = requestTokens.get(request);
  return token === undefined ? [apiKey] : [apiKey, token, `Bearer ${token}`];
}

function normalizeResponseError(
  response: AxiosResponse<unknown>,
  requestTokens: RequestTokenStore,
  apiKey: string,
): ServerlessApiError {
  try {
    const envelope = parseEnvelope(response.data, response.status);
    const safeError = safeServerError(
      envelope.code,
      envelope.message,
      requestSecrets(response.config, requestTokens, apiKey),
    );

    return new ServerlessApiError(
      envelope.status,
      safeError.code,
      safeError.message,
    );
  } catch (caught) {
    return caught instanceof ServerlessApiError
      ? caught
      : invalidEnvelope(response.status);
  }
}

function normalizeRejectedError(
  error: unknown,
  requestTokens: RequestTokenStore,
  apiKey: string,
): ServerlessApiError {
  if (error instanceof ServerlessApiError) {
    return error;
  }

  if (axios.isCancel(error)) {
    return new ServerlessApiError(
      0,
      'REQUEST_CANCELLED',
      REQUEST_CANCELLED_MESSAGE,
    );
  }

  if (axios.isAxiosError(error)) {
    if (error.response !== undefined) {
      return normalizeResponseError(error.response, requestTokens, apiKey);
    }

    return new ServerlessApiError(0, 'NETWORK_ERROR', REQUEST_FAILURE_MESSAGE);
  }

  return new ServerlessApiError(0, 'REQUEST_FAILED', REQUEST_FAILURE_MESSAGE);
}

function toAxiosConfig(
  config: ServerlessRequestConfig | undefined,
): AxiosRequestConfig {
  return {
    ...(config?.params === undefined ? {} : { params: config.params }),
    ...(config?.signal === undefined ? {} : { signal: config.signal }),
  };
}

function rememberHandledToken(tokens: Set<string>, token: string): void {
  if (tokens.size >= MAX_HANDLED_UNAUTHORIZED_TOKENS) {
    const oldest = tokens.values().next().value;
    if (oldest !== undefined) {
      tokens.delete(oldest);
    }
  }
  tokens.add(token);
}

export function createRestClient(
  config: RuntimeConfig,
  getIdToken: () => Promise<string>,
  onUnauthorized: UnauthorizedHandler,
  adapter?: AxiosAdapter,
): ServerlessRestClient {
  const requestTokens: RequestTokenStore = new WeakMap();
  const unauthorizedChecks = new Map<string, Promise<void>>();
  const handledUnauthorizedTokens = new Set<string>();
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
          const safeError = safeServerError(
            envelope.code,
            envelope.message,
            requestSecrets(response.config, requestTokens, config.restApiKey),
          );
          const error = new ServerlessApiError(
            envelope.status,
            safeError.code,
            safeError.message,
          );

          if (isUnauthorized(envelope.status, response.status)) {
            await handleUnauthorized(
              response.config,
              requestTokens,
              unauthorizedChecks,
              handledUnauthorizedTokens,
              getIdToken,
              onUnauthorized,
            );
          }

          return Promise.reject(error);
        }

        return response;
      } finally {
        requestTokens.delete(response.config);
      }
    },
    async (error: unknown) => {
      const normalized = normalizeRejectedError(
        error,
        requestTokens,
        config.restApiKey,
      );
      const response = axios.isAxiosError(error) ? error.response : undefined;

      if (response === undefined) {
        return Promise.reject(normalized);
      }

      try {
        if (isUnauthorized(normalized.status, response.status)) {
          await handleUnauthorized(
            response.config,
            requestTokens,
            unauthorizedChecks,
            handledUnauthorizedTokens,
            getIdToken,
            onUnauthorized,
          );
        }
      } finally {
        requestTokens.delete(response.config);
      }

      return Promise.reject(normalized);
    },
  );

  async function request<T>(
    method: 'get' | 'post' | 'put',
    url: string,
    data: unknown,
    requestConfig: ServerlessRequestConfig | undefined,
  ): Promise<ApiEnvelope<T>> {
    const response = await client.request<ApiEnvelope<T>>({
      ...toAxiosConfig(requestConfig),
      method,
      url,
      ...(method === 'get' ? {} : { data }),
    });
    return response.data;
  }

  return {
    get: <T>(url: string, requestConfig?: ServerlessRequestConfig) => (
      request<T>('get', url, undefined, requestConfig)
    ),
    post: <T>(
      url: string,
      data?: unknown,
      requestConfig?: ServerlessRequestConfig,
    ) => request<T>('post', url, data, requestConfig),
    put: <T>(
      url: string,
      data?: unknown,
      requestConfig?: ServerlessRequestConfig,
    ) => request<T>('put', url, data, requestConfig),
  };
}

async function handleUnauthorized(
  request: RequestConfig,
  requestTokens: RequestTokenStore,
  unauthorizedChecks: Map<string, Promise<void>>,
  handledUnauthorizedTokens: Set<string>,
  getIdToken: () => Promise<string>,
  onUnauthorized: UnauthorizedHandler,
): Promise<void> {
  const rejectedToken = requestTokens.get(request);

  if (rejectedToken === undefined) {
    return;
  }

  if (handledUnauthorizedTokens.has(rejectedToken)) {
    return;
  }

  const existingCheck = unauthorizedChecks.get(rejectedToken);
  if (existingCheck !== undefined) {
    await existingCheck;
    return;
  }

  const check = recheckUnauthorized(
    rejectedToken,
    getIdToken,
    onUnauthorized,
  ).then((handled) => {
    if (handled) {
      rememberHandledToken(handledUnauthorizedTokens, rejectedToken);
    }
  });
  unauthorizedChecks.set(rejectedToken, check);

  try {
    await check;
  } finally {
    if (unauthorizedChecks.get(rejectedToken) === check) {
      unauthorizedChecks.delete(rejectedToken);
    }
  }
}

async function recheckUnauthorized(
  rejectedToken: string,
  getIdToken: () => Promise<string>,
  onUnauthorized: UnauthorizedHandler,
): Promise<boolean> {
  let currentToken: string;

  try {
    currentToken = await getIdToken();
  } catch {
    await notifyUnauthorized(onUnauthorized);
    return true;
  }

  if (currentToken === rejectedToken) {
    await notifyUnauthorized(onUnauthorized);
    return true;
  }

  return false;
}

async function notifyUnauthorized(
  onUnauthorized: UnauthorizedHandler,
): Promise<void> {
  try {
    await onUnauthorized();
  } catch {
    // Keep the original typed API error as the request result.
  }
}
