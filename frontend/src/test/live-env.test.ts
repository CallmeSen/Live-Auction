import { describe, expect, it } from 'vitest';
import {
  readLiveAuctionEnvironment,
  type LiveAuctionEnvironmentInput,
} from '../../e2e/live-env';

const validEnvironment: LiveAuctionEnvironmentInput = {
  LIVE_AUCTION_E2E: '1',
  LIVE_AUCTION_E2E_BASE_URL: 'https://frontend.example.test/',
  LIVE_AUCTION_E2E_ITEM_ID: 'item-123',
  LIVE_AUCTION_E2E_BIDDER_A_USERNAME: 'bidder-a@example.test',
  LIVE_AUCTION_E2E_BIDDER_A_PASSWORD: 'bidder-a-password',
  LIVE_AUCTION_E2E_BIDDER_B_USERNAME: 'bidder-b@example.test',
  LIVE_AUCTION_E2E_BIDDER_B_PASSWORD: 'bidder-b-password',
  LIVE_AUCTION_E2E_ACCEPTED_BID_AMOUNT: '105',
  LIVE_AUCTION_E2E_REJECTED_BID_AMOUNT: '1000',
  LIVE_AUCTION_E2E_EXTENSION_BID_AMOUNT: '110',
};

describe('live auction browser environment', () => {
  it('does not activate without the explicit live marker', () => {
    expect(readLiveAuctionEnvironment({
      ...validEnvironment,
      LIVE_AUCTION_E2E: undefined,
    })).toBeNull();
  });

  it('reads the complete opt-in live checkpoint contract', () => {
    expect(readLiveAuctionEnvironment(validEnvironment)).toEqual({
      baseUrl: 'https://frontend.example.test',
      itemId: 'item-123',
      bidderA: {
        username: 'bidder-a@example.test',
        password: 'bidder-a-password',
      },
      bidderB: {
        username: 'bidder-b@example.test',
        password: 'bidder-b-password',
      },
      acceptedBidAmount: '105',
      rejectedBidAmount: '1000',
      extensionBidAmount: '110',
    });
  });

  it('rejects a missing value without echoing passwords', () => {
    expect(() => readLiveAuctionEnvironment({
      ...validEnvironment,
      LIVE_AUCTION_E2E_BIDDER_B_USERNAME: '',
    })).toThrow('LIVE_AUCTION_E2E_BIDDER_B_USERNAME is required');

    try {
      readLiveAuctionEnvironment({
        ...validEnvironment,
        LIVE_AUCTION_E2E_BIDDER_B_USERNAME: '',
      });
    } catch (error) {
      expect(String(error)).not.toContain(validEnvironment.LIVE_AUCTION_E2E_BIDDER_A_PASSWORD!);
      expect(String(error)).not.toContain(validEnvironment.LIVE_AUCTION_E2E_BIDDER_B_PASSWORD!);
    }
  });

  it('rejects unsafe frontend URLs and invalid bid amounts', () => {
    expect(() => readLiveAuctionEnvironment({
      ...validEnvironment,
      LIVE_AUCTION_E2E_BASE_URL: 'http://frontend.example.test',
    })).toThrow('LIVE_AUCTION_E2E_BASE_URL is invalid');
    expect(() => readLiveAuctionEnvironment({
      ...validEnvironment,
      LIVE_AUCTION_E2E_ACCEPTED_BID_AMOUNT: '0',
    })).toThrow('LIVE_AUCTION_E2E_ACCEPTED_BID_AMOUNT is invalid');
    expect(() => readLiveAuctionEnvironment({
      ...validEnvironment,
      LIVE_AUCTION_E2E_REJECTED_BID_AMOUNT: '1e999',
    })).toThrow('LIVE_AUCTION_E2E_REJECTED_BID_AMOUNT is invalid');
    expect(() => readLiveAuctionEnvironment({
      ...validEnvironment,
      LIVE_AUCTION_E2E_EXTENSION_BID_AMOUNT: '0',
    })).toThrow('LIVE_AUCTION_E2E_EXTENSION_BID_AMOUNT is invalid');
  });
});
