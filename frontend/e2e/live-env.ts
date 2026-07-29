export type LiveAuctionEnvironmentInput = Readonly<
  Record<string, string | undefined>
>;

export type LiveAuctionCredentials = {
  username: string;
  password: string;
};

export type LiveAuctionEnvironment = {
  baseUrl: string;
  itemId: string;
  bidderA: LiveAuctionCredentials;
  bidderB: LiveAuctionCredentials;
  acceptedBidAmount: string;
  rejectedBidAmount: string;
  extensionBidAmount: string;
};

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const POSITIVE_DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const MAX_VALUE_LENGTH = 512;

function readRequired(
  environment: LiveAuctionEnvironmentInput,
  name: string,
): string {
  const value = environment[name];
  if (
    typeof value !== 'string'
    || value.trim() === ''
    || value.length > MAX_VALUE_LENGTH
  ) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function readBaseUrl(environment: LiveAuctionEnvironmentInput): string {
  const value = readRequired(environment, 'LIVE_AUCTION_E2E_BASE_URL');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('LIVE_AUCTION_E2E_BASE_URL is invalid');
  }

  if (
    url.protocol !== 'https:'
    || url.username !== ''
    || url.password !== ''
    || url.search !== ''
    || url.hash !== ''
  ) {
    throw new Error('LIVE_AUCTION_E2E_BASE_URL is invalid');
  }
  return value.replace(/\/+$/, '');
}

function readIdentifier(
  environment: LiveAuctionEnvironmentInput,
  name: string,
): string {
  const value = readRequired(environment, name);
  if (!IDENTIFIER_PATTERN.test(value)) {
    throw new Error(`${name} is invalid`);
  }
  return value;
}

function readPositiveAmount(
  environment: LiveAuctionEnvironmentInput,
  name: string,
): string {
  const value = readRequired(environment, name);
  if (!POSITIVE_DECIMAL_PATTERN.test(value) || Number(value) <= 0) {
    throw new Error(`${name} is invalid`);
  }
  return value;
}

export function readLiveAuctionEnvironment(
  environment: LiveAuctionEnvironmentInput,
): LiveAuctionEnvironment | null {
  if (environment.LIVE_AUCTION_E2E !== '1') return null;

  return {
    baseUrl: readBaseUrl(environment),
    itemId: readIdentifier(environment, 'LIVE_AUCTION_E2E_ITEM_ID'),
    bidderA: {
      username: readRequired(environment, 'LIVE_AUCTION_E2E_BIDDER_A_USERNAME'),
      password: readRequired(environment, 'LIVE_AUCTION_E2E_BIDDER_A_PASSWORD'),
    },
    bidderB: {
      username: readRequired(environment, 'LIVE_AUCTION_E2E_BIDDER_B_USERNAME'),
      password: readRequired(environment, 'LIVE_AUCTION_E2E_BIDDER_B_PASSWORD'),
    },
    acceptedBidAmount: readPositiveAmount(
      environment,
      'LIVE_AUCTION_E2E_ACCEPTED_BID_AMOUNT',
    ),
    rejectedBidAmount: readPositiveAmount(
      environment,
      'LIVE_AUCTION_E2E_REJECTED_BID_AMOUNT',
    ),
    extensionBidAmount: readPositiveAmount(
      environment,
      'LIVE_AUCTION_E2E_EXTENSION_BID_AMOUNT',
    ),
  };
}
