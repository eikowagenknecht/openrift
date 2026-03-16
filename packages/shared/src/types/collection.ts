import type { ActivityType } from "./enums.js";

export interface Collection {
  id: string;
  name: string;
  description: string | null;
  availableForDeckbuilding: boolean;
  isInbox: boolean;
  sortOrder: number;
  shareToken: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Source {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Copy {
  id: string;
  printingId: string;
  collectionId: string;
  sourceId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Denormalized copy with joined card/printing fields (returned by GET /copies). */
export interface CopyRow extends Copy {
  cardId: string;
  setId: string;
  collectorNumber: string;
  rarity: string;
  artVariant: string;
  isSigned: boolean;
  finish: string;
  imageUrl: string | null;
  artist: string | null;
  cardName: string;
  cardType: string;
}

export interface Activity {
  id: string;
  type: ActivityType;
  name: string | null;
  date: string;
  description: string | null;
  isAuto: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Deck {
  id: string;
  name: string;
  description: string | null;
  format: "standard" | "freeform";
  isWanted: boolean;
  isPublic: boolean;
  shareToken: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WishList {
  id: string;
  name: string;
  rules: unknown;
  shareToken: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WishListItem {
  id: string;
  wishListId: string;
  cardId: string | null;
  printingId: string | null;
  quantityDesired: number;
}

export interface TradeList {
  id: string;
  name: string;
  rules: unknown;
  shareToken: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TradeListItem {
  id: string;
  tradeListId: string;
  copyId: string;
}
