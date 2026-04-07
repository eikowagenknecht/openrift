import type {
  CollectionEventResponse,
  CollectionResponse,
  CopyResponse,
  DeckAvailabilityItemResponse,
  DeckCardResponse,
  DeckResponse,
  DeckSummaryResponse,
  TradeListItemDetailResponse,
  TradeListItemResponse,
  TradeListResponse,
  WishListItemResponse,
  WishListResponse,
} from "@openrift/shared";
import type { Selectable } from "kysely";

import type {
  CollectionsTable,
  DecksTable,
  TradeListItemsTable,
  TradeListsTable,
  WishListItemsTable,
  WishListsTable,
} from "../db/index.js";
import type { CollectionValue } from "../repositories/marketplace.js";

// ── Simple entity mappers ──────────────────────────────────────────────────

export function toCollection(
  row: Selectable<CollectionsTable> & { copyCount?: number },
  value?: CollectionValue,
): CollectionResponse {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    availableForDeckbuilding: row.availableForDeckbuilding,
    isInbox: row.isInbox,
    sortOrder: row.sortOrder,
    shareToken: row.shareToken,
    copyCount: row.copyCount ?? 0,
    totalValueCents: value?.totalValueCents ?? null,
    unpricedCopyCount: value?.unpricedCopyCount ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toDeck(row: Selectable<DecksTable>): DeckResponse {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    format: row.format,
    isWanted: row.isWanted,
    isPublic: row.isPublic,
    shareToken: row.shareToken,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** @returns Slimmed-down deck fields for the list view. */
export function toDeckSummary(row: Selectable<DecksTable>): DeckSummaryResponse {
  return {
    id: row.id,
    name: row.name,
    format: row.format,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toTradeList(row: Selectable<TradeListsTable>): TradeListResponse {
  return {
    id: row.id,
    name: row.name,
    rules: row.rules as TradeListResponse["rules"],
    shareToken: row.shareToken,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toTradeListItem(row: Selectable<TradeListItemsTable>): TradeListItemResponse {
  return {
    id: row.id,
    tradeListId: row.tradeListId,
    copyId: row.copyId,
  };
}

export function toWishList(row: Selectable<WishListsTable>): WishListResponse {
  return {
    id: row.id,
    name: row.name,
    rules: row.rules as WishListResponse["rules"],
    shareToken: row.shareToken,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toWishListItem(row: Selectable<WishListItemsTable>): WishListItemResponse {
  return {
    id: row.id,
    wishListId: row.wishListId,
    cardId: row.cardId,
    printingId: row.printingId,
    quantityDesired: row.quantityDesired,
  };
}

/**
 * Maps an enriched collection event row to CollectionEventResponse.
 * @returns The serialized collection event response.
 */
export function toCollectionEvent(row: {
  id: string;
  action: string;
  copyId: string | null;
  printingId: string;
  fromCollectionId: string | null;
  fromCollectionName: string | null;
  toCollectionId: string | null;
  toCollectionName: string | null;
  createdAt: Date;
  shortCode: string;
  rarity: string;
  imageUrl: string | null;
  cardName: string;
  cardType: string;
  cardSuperTypes: string[];
}): CollectionEventResponse {
  return {
    id: row.id,
    action: row.action as CollectionEventResponse["action"],
    copyId: row.copyId,
    printingId: row.printingId,
    fromCollectionId: row.fromCollectionId,
    fromCollectionName: row.fromCollectionName,
    toCollectionId: row.toCollectionId,
    toCollectionName: row.toCollectionName,
    createdAt: row.createdAt.toISOString(),
    shortCode: row.shortCode,
    rarity: row.rarity as CollectionEventResponse["rarity"],
    imageUrl: row.imageUrl,
    cardName: row.cardName,
    cardType: row.cardType as CollectionEventResponse["cardType"],
    cardSuperTypes: row.cardSuperTypes,
  };
}

// ── Composite / detail mappers ─────────────────────────────────────────────

/**
 * Maps a copy row to CopyResponse.
 * @returns The serialized copy response.
 */
export function toCopy(row: {
  id: string;
  printingId: string;
  collectionId: string;
  createdAt: Date;
  updatedAt: Date;
}): CopyResponse {
  return {
    id: row.id,
    printingId: row.printingId,
    collectionId: row.collectionId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Maps a denormalized deck card row to DeckCardResponse.
 * @returns The serialized deck card response.
 */
export function toDeckCard(row: {
  id: string;
  deckId: string;
  cardId: string;
  zone: string;
  quantity: number;
  cardName: string;
  cardType: string;
  superTypes: string[];
  domains: string[];
  tags: string[];
  keywords: string[];
  energy: number | null;
  might: number | null;
  power: number | null;
  imageUrl: string | null;
}): DeckCardResponse {
  return {
    id: row.id,
    deckId: row.deckId,
    cardId: row.cardId,
    zone: row.zone as DeckCardResponse["zone"],
    quantity: row.quantity,
    cardName: row.cardName,
    cardType: row.cardType as DeckCardResponse["cardType"],
    superTypes: row.superTypes as DeckCardResponse["superTypes"],
    domains: row.domains as DeckCardResponse["domains"],
    tags: row.tags,
    keywords: row.keywords,
    energy: row.energy,
    might: row.might,
    power: row.power,
    imageUrl: row.imageUrl,
  };
}

/**
 * Maps a denormalized trade list item row to TradeListItemDetailResponse.
 * @returns The serialized trade list item detail response.
 */
export function toTradeListItemDetail(row: {
  id: string;
  tradeListId: string;
  copyId: string;
  printingId: string;
  collectionId: string;
  imageUrl: string | null;
  setId: string;
  collectorNumber: number;
  rarity: string;
  finish: string;
  cardName: string;
  cardType: string;
}): TradeListItemDetailResponse {
  return {
    id: row.id,
    tradeListId: row.tradeListId,
    copyId: row.copyId,
    printingId: row.printingId,
    collectionId: row.collectionId,
    imageUrl: row.imageUrl,
    setId: row.setId,
    collectorNumber: row.collectorNumber,
    rarity: row.rarity as TradeListItemDetailResponse["rarity"],
    finish: row.finish as TradeListItemDetailResponse["finish"],
    cardName: row.cardName,
    cardType: row.cardType as TradeListItemDetailResponse["cardType"],
  };
}

/**
 * Maps a deck availability computation to DeckAvailabilityItemResponse.
 * @returns The serialized deck availability item.
 */
export function toDeckAvailabilityItem(row: {
  cardId: string;
  zone: string;
  needed: number;
  owned: number;
  shortfall: number;
}): DeckAvailabilityItemResponse {
  return {
    cardId: row.cardId,
    zone: row.zone as DeckAvailabilityItemResponse["zone"],
    needed: row.needed,
    owned: row.owned,
    shortfall: row.shortfall,
  };
}
