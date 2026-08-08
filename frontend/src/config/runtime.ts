export type RuntimeConfig = {
  region: string;
  userPoolId: string;
  userPoolClientId: string;
  restApiUrl: string;
  restApiKey: string;
  websocketUrl: string;
  mediaBaseUrl: string;
};

type RuntimeEnvironment = Readonly<Record<string, unknown>>;

type RuntimeEnvironmentName =
  | 'VITE_AWS_REGION'
  | 'VITE_COGNITO_USER_POOL_ID'
  | 'VITE_COGNITO_CLIENT_ID'
  | 'VITE_REST_API_URL'
  | 'VITE_REST_API_KEY'
  | 'VITE_WS_URL'
  | 'VITE_MEDIA_BASE_URL';

const MAX_LENGTHS: Record<RuntimeEnvironmentName, number> = {
  VITE_AWS_REGION: 64,
  VITE_COGNITO_USER_POOL_ID: 256,
  VITE_COGNITO_CLIENT_ID: 256,
  VITE_REST_API_URL: 2048,
  VITE_REST_API_KEY: 512,
  VITE_WS_URL: 2048,
  VITE_MEDIA_BASE_URL: 2048,
};

const REGION_PATTERN = /^[a-z]{2}(?:-[a-z0-9]+)+-[0-9]+$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+$/;
const PRINTABLE_ASCII_PATTERN = /^[\x21-\x7e]+$/;

function readString(
  environment: RuntimeEnvironment,
  name: RuntimeEnvironmentName,
): string {
  const value = environment[name];

  if (value === undefined || value === null || value === '') {
    throw new Error(`${name} is required`);
  }
  if (typeof value !== 'string' || value.trim() !== value) {
    throw new Error(`${name} is invalid`);
  }
  if (value.length > MAX_LENGTHS[name]) {
    throw new Error(`${name} is too long`);
  }

  return value;
}

function readMatchingString(
  environment: RuntimeEnvironment,
  name: RuntimeEnvironmentName,
  pattern: RegExp,
): string {
  const value = readString(environment, name);

  if (!pattern.test(value)) {
    throw new Error(`${name} is invalid`);
  }

  return value;
}

function readUrl(
  environment: RuntimeEnvironment,
  name: 'VITE_REST_API_URL' | 'VITE_WS_URL' | 'VITE_MEDIA_BASE_URL',
  allowedProtocols: readonly string[],
  productionProtocol: 'https:' | 'wss:',
): string {
  const value = readString(environment, name);
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} is invalid`);
  }

  if (
    !allowedProtocols.includes(url.protocol)
    || url.username !== ''
    || url.password !== ''
    || url.hash !== ''
  ) {
    throw new Error(`${name} is invalid`);
  }

  if (environment.MODE === 'production' && url.protocol !== productionProtocol) {
    throw new Error(`${name} must use ${productionProtocol.slice(0, -1)}`);
  }

  return value.replace(/\/+$/, '');
}

export function parseRuntimeConfig(
  environment: RuntimeEnvironment,
): RuntimeConfig {
  return {
    region: readMatchingString(
      environment,
      'VITE_AWS_REGION',
      REGION_PATTERN,
    ),
    userPoolId: readMatchingString(
      environment,
      'VITE_COGNITO_USER_POOL_ID',
      IDENTIFIER_PATTERN,
    ),
    userPoolClientId: readMatchingString(
      environment,
      'VITE_COGNITO_CLIENT_ID',
      IDENTIFIER_PATTERN,
    ),
    restApiUrl: readUrl(
      environment,
      'VITE_REST_API_URL',
      ['http:', 'https:'],
      'https:',
    ),
    restApiKey: readMatchingString(
      environment,
      'VITE_REST_API_KEY',
      PRINTABLE_ASCII_PATTERN,
    ),
    websocketUrl: readUrl(
      environment,
      'VITE_WS_URL',
      ['ws:', 'wss:'],
      'wss:',
    ),
    mediaBaseUrl: readUrl(
      environment,
      'VITE_MEDIA_BASE_URL',
      ['http:', 'https:'],
      'https:',
    ),
  };
}

export const runtimeConfig = parseRuntimeConfig(import.meta.env);
