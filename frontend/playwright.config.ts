import { defineConfig } from '@playwright/test';

const mockServerUrl = 'http://127.0.0.1:4174';
const liveAuctionEnabled = process.env.LIVE_AUCTION_E2E === '1';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'mock',
      testMatch: 'mock-auction.spec.ts',
      use: { baseURL: 'http://127.0.0.1:4173' },
    },
    ...(liveAuctionEnabled ? [{
      name: 'live',
      testMatch: 'live-auction.spec.ts',
      use: {
        baseURL: process.env.LIVE_AUCTION_E2E_BASE_URL
          ?? 'https://live-auction.invalid',
        screenshot: 'off',
        trace: 'off',
        video: 'off',
      },
    }] : []),
  ],
  ...(liveAuctionEnabled ? {} : {
    webServer: {
      command: 'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort',
      port: 4173,
      reuseExistingServer: false,
      env: {
        ...process.env,
        VITE_AWS_REGION: 'ap-southeast-2',
        VITE_COGNITO_USER_POOL_ID: 'ap-southeast-2_testpool',
        VITE_COGNITO_CLIENT_ID: 'testclient',
        VITE_REST_API_URL: mockServerUrl,
        VITE_REST_API_KEY: 'e2e-local-api-key',
        VITE_WS_URL: 'ws://127.0.0.1:4174/ws',
        VITE_MEDIA_BASE_URL: 'http://127.0.0.1:4174/media',
        VITE_E2E_MOCK_AUTH: 'true',
      },
    },
  }),
});
