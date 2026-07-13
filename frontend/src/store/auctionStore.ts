import type { AuthUser } from '../features/auth/types';
import type { Auction, AuctionApprovalStatus, AuctionStatus } from '../features/auction/types';
import { mockAuctions } from '../mocks/auctions';

const STORAGE_KEY = 'demoAuctionsV2';
const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1560393464-5c69a73c5770?auto=format&fit=crop&q=85&w=1200';

export interface CreateDemoAuctionInput {
  title: string;
  category: string;
  startingPrice: number;
  minimumBidIncrement: number;
  startTime: string;
  endTime: string;
  description: string;
}

const categoryIds: Record<string, string> = {
  'Đồng hồ': 'cat-watch',
  'Máy ảnh': 'cat-camera',
  'Âm thanh': 'cat-audio',
  'Sưu tầm': 'cat-collectible',
};

const readStoredAuctions = (): Auction[] | null => {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Auction[] | null;
    return Array.isArray(stored) ? stored : null;
  } catch {
    return null;
  }
};

const saveAuctions = (auctions: Auction[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(auctions));
};

const syncTemporalStatus = (auction: Auction): Auction => {
  if (auction.status === 'CANCELLED') return auction;
  const now = Date.now();
  const startTime = new Date(auction.startTime).getTime();
  const endTime = new Date(auction.endTime).getTime();
  const status: AuctionStatus = endTime <= now ? 'ENDED' : startTime > now ? 'UPCOMING' : 'ACTIVE';
  return status === auction.status ? auction : { ...auction, status };
};

export const getDemoAuctions = (): Auction[] => (readStoredAuctions() ?? mockAuctions).map(syncTemporalStatus);

export const getPublicDemoAuctions = (): Auction[] => getDemoAuctions().filter(
  (auction) => auction.approvalStatus === 'APPROVED' && auction.status !== 'CANCELLED',
);

export const createDemoAuction = (input: CreateDemoAuctionInput, user: AuthUser): Auction => {
  const auctions = getDemoAuctions();
  const now = new Date();
  const start = new Date(input.startTime);
  const status: AuctionStatus = start > now ? 'UPCOMING' : 'ACTIVE';
  const auction: Auction = {
    id: Math.max(0, ...auctions.map((item) => item.id)) + 1,
    title: input.title.trim(),
    category: input.category,
    categoryId: categoryIds[input.category] ?? 'cat-other',
    image: FALLBACK_IMAGE,
    images: [FALLBACK_IMAGE],
    currentPrice: input.startingPrice,
    startingPrice: input.startingPrice,
    minimumBidIncrement: input.minimumBidIncrement,
    bidCount: 0,
    startTime: start.toISOString(),
    endTime: new Date(input.endTime).toISOString(),
    createdAt: now.toISOString(),
    status,
    approvalStatus: 'PENDING',
    seller: user.fullName,
    sellerEmail: user.email,
    location: 'Chưa cập nhật',
    condition: 'Chờ Admin kiểm duyệt',
    description: input.description.trim(),
  };
  saveAuctions([auction, ...auctions]);
  return auction;
};

export const updateDemoAuction = (id: number, updates: Partial<Auction>): Auction[] => {
  const auctions = getDemoAuctions().map((auction) => auction.id === id ? { ...auction, ...updates } : auction);
  saveAuctions(auctions);
  return auctions;
};

export const updateDemoAuctionApproval = (id: number, approvalStatus: AuctionApprovalStatus): Auction[] => (
  updateDemoAuction(id, { approvalStatus })
);
