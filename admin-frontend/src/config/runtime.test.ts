import { describe, expect, it, vi } from 'vitest';

const validEnvironment = {
  MODE: 'production',
  VITE_AWS_REGION: 'ap-southeast-1',
  VITE_COGNITO_USER_POOL_ID: 'ap-southeast-1_example',
  VITE_COGNITO_CLIENT_ID: 'client-example',
  VITE_REST_API_URL: 'https://rest.example.test/prod/',
  VITE_REST_API_KEY: 'quota-key',
  VITE_USER_APP_URL: 'https://user.example.test/',
};

for (const [name, value] of Object.entries(validEnvironment)) {
  vi.stubEnv(name, value);
}

const { parseRuntimeConfig } = await import('./runtime');

describe('parseRuntimeConfig', () => {
  it('accepts and normalizes the production contract', () => {
    expect(parseRuntimeConfig(validEnvironment)).toEqual({
      region: 'ap-southeast-1',
      userPoolId: 'ap-southeast-1_example',
      userPoolClientId: 'client-example',
      restApiUrl: 'https://rest.example.test/prod',
      restApiKey: 'quota-key',
      userAppUrl: 'https://user.example.test',
    });
  });

  it.each([
    'VITE_AWS_REGION',
    'VITE_COGNITO_USER_POOL_ID',
    'VITE_COGNITO_CLIENT_ID',
    'VITE_REST_API_URL',
    'VITE_REST_API_KEY',
    'VITE_USER_APP_URL',
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

  it('rejects insecure production URLs and localhost user handoff', () => {
    expect(() => parseRuntimeConfig({
      ...validEnvironment,
      VITE_REST_API_URL: 'http://rest.example.test',
    })).toThrow('VITE_REST_API_URL must use https');

    expect(() => parseRuntimeConfig({
      ...validEnvironment,
      VITE_USER_APP_URL: 'http://localhost:5173',
    })).toThrow('VITE_USER_APP_URL must use https');
  });

  it('allows local HTTP values outside production', () => {
    const config = parseRuntimeConfig({
      ...validEnvironment,
      MODE: 'development',
      VITE_REST_API_URL: 'http://localhost:3000/',
      VITE_USER_APP_URL: 'http://localhost:5173/',
    });

    expect(config.restApiUrl).toBe('http://localhost:3000');
    expect(config.userAppUrl).toBe('http://localhost:5173');
  });

  it('rejects credentials, fragments, and malformed URLs', () => {
    expect(() => parseRuntimeConfig({
      ...validEnvironment,
      VITE_REST_API_URL: 'https://user:password@rest.example.test/prod',
    })).toThrow('VITE_REST_API_URL is invalid');

    expect(() => parseRuntimeConfig({
      ...validEnvironment,
      VITE_USER_APP_URL: 'https://user.example.test/#fragment',
    })).toThrow('VITE_USER_APP_URL is invalid');

    expect(() => parseRuntimeConfig({
      ...validEnvironment,
      VITE_COGNITO_CLIENT_ID: 'x'.repeat(257),
    })).toThrow('VITE_COGNITO_CLIENT_ID is too long');
  });
});
