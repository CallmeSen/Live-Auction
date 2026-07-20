export type UUID = string;
export type Money = string;
export type ISODateTime = string;

export enum UserRole {
  ADMIN = 'ADMIN',
  USER = 'USER',
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  BANNED = 'BANNED',
}

export enum CategoryStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export enum AuctionSessionStatus {
  SCHEDULED = 'SCHEDULED',
  ACTIVE = 'ACTIVE',
  ENDED = 'ENDED',
  CANCELLED = 'CANCELLED',
}

export enum AuctionItemStatus {
  DRAFT = 'DRAFT',
  READY = 'READY',
  OPEN = 'OPEN',
  SOLD = 'SOLD',
  UNSOLD = 'UNSOLD',
  CANCELLED = 'CANCELLED',
}

export enum BidStatus {
  WINNING = 'WINNING',
  OUTBID = 'OUTBID',
  CANCELLED = 'CANCELLED',
}