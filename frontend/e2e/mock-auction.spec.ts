import { expect, test, type Browser, type Page } from '@playwright/test';
import { MockAuctionServer } from './fixtures/mockServer';

const MOCK_SERVER_URL = 'http://127.0.0.1:4174';
const mockServer = new MockAuctionServer(4174);

test.beforeAll(async () => {
  await mockServer.start();
});

test.afterAll(async () => {
  await mockServer.stop();
});

async function login(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('textbox', { name: 'Mật khẩu' }).fill('e2e-password');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page).toHaveURL(/\/auctions$/);
}

function connectionStatus(page: Page) {
  return page.locator('aside > div[role="status"]');
}

async function openBidderRoom(browser: Browser, email: string, viewport: {
  width: number;
  height: number;
}) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await login(page, email);
  await page.goto('/auction-items/item-1');
  await expect(connectionStatus(page)).toHaveText(/đã kết nối/i);
  return { context, page };
}

test.describe.serial('mocked live auction room', () => {
  test('broadcasts an accepted bid to two independent bidder contexts', async ({ browser }) => {
    const bidderA = await openBidderRoom(browser, 'bidder-a@example.test', { width: 1440, height: 900 });
    const bidderB = await openBidderRoom(browser, 'bidder-b@example.test', { width: 1440, height: 900 });

    try {
      await bidderA.page.getByLabel('Giá của bạn').fill('105');
      await bidderA.page.getByRole('button', { name: 'Xác nhận trả giá' }).click();

      await expect(bidderA.page.locator('aside [role="status"]').filter({ hasText: /đặt giá thành công/i })).toBeVisible();
      await expect(bidderA.page.getByLabel('Giá hiện tại')).toContainText('105');
      await expect(bidderB.page.getByLabel('Giá hiện tại')).toContainText('105');
      await expect(bidderB.page.getByLabel('Người đang dẫn đầu')).toContainText('Bidder A');
    } finally {
      await bidderA.context.close();
      await bidderB.context.close();
    }
  });

  test('shows a rejected bid only to its initiating bidder', async ({ browser }) => {
    const bidderA = await openBidderRoom(browser, 'bidder-a@example.test', { width: 1440, height: 900 });
    const bidderB = await openBidderRoom(browser, 'bidder-b@example.test', { width: 1440, height: 900 });

    try {
      await bidderA.page.getByLabel('Giá của bạn').fill('999');
      await bidderA.page.getByRole('button', { name: 'Xác nhận trả giá' }).click();

      await expect(bidderA.page.getByRole('alert')).toContainText('Giá thấp hơn bước giá tối thiểu.');
      await expect(bidderB.page.getByRole('alert')).toHaveCount(0);
    } finally {
      await bidderA.context.close();
      await bidderB.context.close();
    }
  });

  test('refreshes the REST snapshot after a forced socket close', async ({ browser, request }) => {
    const bidder = await openBidderRoom(browser, 'bidder-a@example.test', { width: 1440, height: 900 });

    try {
      await request.post(`${MOCK_SERVER_URL}/_test/force-disconnect`);
      await expect.poll(async () => {
        const response = await request.get(`${MOCK_SERVER_URL}/_test/state`);
        return (await response.json()).itemRequests;
      }).toBeGreaterThanOrEqual(2);
      await expect(connectionStatus(bidder.page)).toHaveText(/đã kết nối/i);
    } finally {
      await bidder.context.close();
    }
  });

  test('keeps the live room within all supported viewport widths', async ({ browser }, testInfo) => {
    const viewports = [
      { width: 1440, height: 900, name: 'desktop' },
      { width: 768, height: 1024, name: 'tablet' },
      { width: 390, height: 844, name: 'mobile' },
    ];

    for (const viewport of viewports) {
      const bidder = await openBidderRoom(browser, 'bidder-a@example.test', viewport);
      try {
        await expect(bidder.page.getByLabel('Giá hiện tại')).toBeVisible();
        await expect(bidder.page.getByLabel('Thời gian còn lại')).toBeVisible();
        await expect(bidder.page.getByRole('button', { name: 'Xác nhận trả giá' })).toBeVisible();
        await expect(bidder.page.locator('body')).not.toContainText(/token=|mock-token/i);
        expect(await bidder.page.evaluate(() => (
          document.documentElement.scrollWidth <= window.innerWidth
        ))).toBe(true);
        await bidder.page.screenshot({
          path: testInfo.outputPath(`live-room-${viewport.name}.png`),
          fullPage: true,
        });
      } finally {
        await bidder.context.close();
      }
    }
  });
});
