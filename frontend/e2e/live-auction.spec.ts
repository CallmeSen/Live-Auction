import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import {
  readLiveAuctionEnvironment,
  type LiveAuctionCredentials,
  type LiveAuctionEnvironment,
} from './live-env';

const liveProcess = globalThis as typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
};
const configuredLiveEnvironment = readLiveAuctionEnvironment(
  liveProcess.process?.env ?? {},
);

if (configuredLiveEnvironment === null) {
  throw new Error('LIVE_AUCTION_E2E must be 1 for the live browser project');
}

const liveEnvironment: LiveAuctionEnvironment = configuredLiveEnvironment;

type BidderRoom = {
  context: BrowserContext;
  page: Page;
};


const countdownLabel = 'Thời gian còn lại';

function connectionStatus(page: Page) {
  return page.getByRole('status', { name: 'Live connection status' });
}

function extensionStatus(page: Page) {
  return page.locator('aside').getByText(/^\d+ lần gia hạn$/);
}

function countdownRegion(page: Page) {
  return page.getByRole('region', { name: countdownLabel });
}

function parseCountdown(value: string | null): number {
  const parts = value?.trim().split(':').map(Number) ?? [];
  if (
    (parts.length !== 2 && parts.length !== 3)
    || parts.some((part) => !Number.isInteger(part) || part < 0)
  ) {
    throw new Error('Live countdown is unavailable');
  }

  return parts.length === 3
    ? (parts[0] * 3_600) + (parts[1] * 60) + parts[2]
    : (parts[0] * 60) + parts[1];
}

async function remainingSeconds(page: Page): Promise<number> {
  return parseCountdown(await countdownRegion(page).locator('p').last().textContent());
}

async function login(page: Page, credentials: LiveAuctionCredentials): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(credentials.username);
  await page.locator('input[type="password"]').fill(credentials.password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page).toHaveURL(/\/auctions$/, { timeout: 20_000 });
}

async function navigateToAuctionItem(page: Page, itemId: string): Promise<void> {
  const target = `/auction-items/${encodeURIComponent(itemId)}`;
  await page.evaluate((path) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, target);
  await expect(page).toHaveURL(new RegExp(`${target}$`));
}

async function openBidderRoom(
  browser: Browser,
  credentials: LiveAuctionCredentials,
): Promise<BidderRoom> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, credentials);
  await navigateToAuctionItem(page, liveEnvironment.itemId);
  await expect(connectionStatus(page)).toContainText('Đã kết nối', { timeout: 30_000 });
  return { context, page };
}

async function submitBid(page: Page, amount: string): Promise<void> {
  await page.getByLabel('Giá của bạn').fill(amount);
  await page.getByRole('button', { name: 'Xác nhận trả giá' }).click();
}

test.describe.serial('live auction checkpoint', () => {
  test('extends the countdown for both bidders after a near-end bid', async ({ browser }) => {
    test.setTimeout(120_000);
    const bidderA = await openBidderRoom(browser, liveEnvironment.bidderA);
    const bidderB = await openBidderRoom(browser, liveEnvironment.bidderB);

    try {
      await expect.poll(
        () => remainingSeconds(bidderA.page),
        { timeout: 45_000 },
      ).toBeLessThanOrEqual(25);
      const previousAExtension = await extensionStatus(bidderA.page).textContent();
      const previousBExtension = await extensionStatus(bidderB.page).textContent();

      await submitBid(bidderA.page, liveEnvironment.extensionBidAmount);
      await expect(bidderA.page.getByLabel('Giá hiện tại')).toContainText(
        liveEnvironment.extensionBidAmount,
      );
      await expect(bidderB.page.getByLabel('Giá hiện tại')).toContainText(
        liveEnvironment.extensionBidAmount,
      );
      await expect.poll(
        () => remainingSeconds(bidderA.page),
        { timeout: 15_000 },
      ).toBeGreaterThan(45);
      await expect.poll(
        () => remainingSeconds(bidderB.page),
        { timeout: 15_000 },
      ).toBeGreaterThan(45);
      await expect(extensionStatus(bidderA.page)).not.toHaveText(previousAExtension ?? '');
      await expect(extensionStatus(bidderB.page)).not.toHaveText(previousBExtension ?? '');
    } finally {
      await bidderA.context.close();
      await bidderB.context.close();
    }
  });

  test('broadcasts an accepted bid and keeps a rejection local to its bidder', async ({ browser }) => {
    test.setTimeout(120_000);
    const bidderA = await openBidderRoom(browser, liveEnvironment.bidderA);
    const bidderB = await openBidderRoom(browser, liveEnvironment.bidderB);

    try {
      await submitBid(bidderA.page, liveEnvironment.acceptedBidAmount);
      await expect(bidderA.page.getByLabel('Giá hiện tại')).toContainText(
        liveEnvironment.acceptedBidAmount,
      );
      await expect(bidderB.page.getByLabel('Giá hiện tại')).toContainText(
        liveEnvironment.acceptedBidAmount,
      );

      await submitBid(bidderB.page, liveEnvironment.rejectedBidAmount);
      await expect(bidderB.page.getByRole('alert')).toBeVisible();
      await expect(bidderA.page.getByRole('alert')).toHaveCount(0);
    } finally {
      await bidderA.context.close();
      await bidderB.context.close();
    }
  });

  test('reconnects after a browser network interruption and restores room state', async ({ browser }) => {
    test.setTimeout(90_000);
    const bidder = await openBidderRoom(browser, liveEnvironment.bidderA);

    try {
      const currentPrice = await bidder.page.getByLabel('Giá hiện tại').textContent();
      await bidder.context.setOffline(true);
      await expect(connectionStatus(bidder.page)).toContainText('Đang ngoại tuyến');
      await bidder.context.setOffline(false);
      await expect(connectionStatus(bidder.page)).toContainText('Đã kết nối');
      await expect(bidder.page.getByLabel('Giá hiện tại')).toHaveText(currentPrice ?? '');
    } finally {
      await bidder.context.close();
    }
  });
});
