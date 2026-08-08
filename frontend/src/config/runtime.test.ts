import { afterAll, describe, expect, it, vi } from 'vitest';

const validEnvironment = {
  MODE: 'production',
  VITE_AWS_REGION: 'ap-southeast-1',
  VITE_COGNITO_USER_POOL_ID: 'ap-southeast-1_example',
  VITE_COGNITO_CLIENT_ID: 'client-example',
  VITE_REST_API_URL: 'https://rest.example.test/prod/',
  VITE_REST_API_KEY: 'quota-key',
  VITE_WS_URL: 'wss://ws.example.test/prod/',
  VITE_MEDIA_BASE_URL: 'https://media.example.test/',
};

for (const [name, value] of Object.entries(validEnvironment)) {
  vi.stubEnv(name, value);
}

const { parseRuntimeConfig, runtimeConfig } = await import('./runtime');

afterAll(() => vi.unstubAllEnvs());

describe('parseRuntimeConfig', () => {
  it('accepts and normalizes the complete production contract', () => {
    expect(parseRuntimeConfig(validEnvironment)).toEqual({
      region: 'ap-southeast-1',
      userPoolId: 'ap-southeast-1_example',
      userPoolClientId: 'client-example',
      restApiUrl: 'https://rest.example.test/prod',
      restApiKey: 'quota-key',
      websocketUrl: 'wss://ws.example.test/prod',
      mediaBaseUrl: 'https://media.example.test',
    });
  });

  it('initializes the runtime config from the Vite environment', () => {
    expect(runtimeConfig).toEqual(parseRuntimeConfig(import.meta.env));
  });

  it.each([
    'VITE_AWS_REGION',
    'VITE_COGNITO_USER_POOL_ID',
    'VITE_COGNITO_CLIENT_ID',
    'VITE_REST_API_URL',
    'VITE_REST_API_KEY',
    'VITE_WS_URL',
    'VITE_MEDIA_BASE_URL',
  ])('rejects missing %s without echoing another value', (name) => {
    const secretMarker = 'must-not-appear';
    const environment = {
      ...validEnvironment,
      VITE_REST_API_KEY: secretMarker,
      [name]: '',
    };

    expect(() => parseRuntimeConfig(environment)).toThrow(`${name} is required`);
    try {
      parseRuntimeConfig(environment);
    } catch (error) {
      expect(String(error)).not.toContain(secretMarker);
    }
  });

  it('rejects insecure production REST and WebSocket URLs', () => {
    expect(() => parseRuntimeConfig({
      ...validEnvironment,
      VITE_REST_API_URL: 'http://rest.example.test',
    })).toThrow('VITE_REST_API_URL must use https');

    expect(() => parseRuntimeConfig({
      ...validEnvironment,
      VITE_WS_URL: 'ws://ws.example.test',
    })).toThrow('VITE_WS_URL must use wss');
  });

  it('allows local HTTP and WS URLs outside production', () => {
    const config = parseRuntimeConfig({
      ...validEnvironment,
      MODE: 'development',
      VITE_REST_API_URL: 'http://localhost:3000/',
      VITE_WS_URL: 'ws://localhost:3001/',
    });

    expect(config.restApiUrl).toBe('http://localhost:3000');
    expect(config.websocketUrl).toBe('ws://localhost:3001');
  });

  it.each([
    [
      'VITE_REST_API_URL',
      'https://rest.example.test/prod#fragment',
    ],
    [
      'VITE_WS_URL',
      'wss://ws.example.test/prod#fragment',
    ],
  ] as const)('rejects hash fragments in %s', (name, value) => {
    expect(() => parseRuntimeConfig({
      ...validEnvironment,
      [name]: value,
    })).toThrow(`${name} is invalid`);
  });

  it.each([
    ['a malformed REST URL', 'VITE_REST_API_URL', 'not-a-url'],
    ['a malformed WebSocket URL', 'VITE_WS_URL', 'wss://'],
    [
      'credentials in the REST URL',
      'VITE_REST_API_URL',
      'https://user:password@rest.example.test/prod',
    ],
    [
      'credentials in the WebSocket URL',
      'VITE_WS_URL',
      'wss://user:password@ws.example.test/prod',
    ],
    [
      'an unsupported REST protocol',
      'VITE_REST_API_URL',
      'ftp://rest.example.test/prod',
    ],
    [
      'an unsupported WebSocket protocol',
      'VITE_WS_URL',
      'https://ws.example.test/prod',
    ],
    [
      'leading whitespace in the REST URL',
      'VITE_REST_API_URL',
      ' https://rest.example.test/prod',
    ],
    [
      'trailing whitespace in the WebSocket URL',
      'VITE_WS_URL',
      'wss://ws.example.test/prod ',
    ],
  ] as const)('rejects %s', (_case, name, value) => {
    expect(() => parseRuntimeConfig({
      ...validEnvironment,
      [name]: value,
    })).toThrow(`${name} is invalid`);
  });

  it('rejects invalid API-key characters', () => {
    expect(() => parseRuntimeConfig({
      ...validEnvironment,
      VITE_REST_API_KEY: 'quota key',
    })).toThrow('VITE_REST_API_KEY is invalid');
  });

  it.each([
    [
      'VITE_REST_API_URL',
      `https://rest.example.test/${'x'.repeat(2048)}`,
    ],
    [
      'VITE_WS_URL',
      `wss://ws.example.test/${'x'.repeat(2048)}`,
    ],
  ] as const)('rejects an overlong %s', (name, value) => {
    expect(() => parseRuntimeConfig({
      ...validEnvironment,
      [name]: value,
    })).toThrow(`${name} is too long`);
  });

  it('rejects malformed or unbounded values', () => {
    expect(() => parseRuntimeConfig({
      ...validEnvironment,
      VITE_AWS_REGION: 'not a region',
    })).toThrow('VITE_AWS_REGION is invalid');

    expect(() => parseRuntimeConfig({
      ...validEnvironment,
      VITE_COGNITO_CLIENT_ID: 'x'.repeat(257),
    })).toThrow('VITE_COGNITO_CLIENT_ID is too long');
  });
});
