import type {
  ActivityItemResponse,
  ActivityResponse,
  CollectionResponse,
  CopyResponse,
  DeckAvailabilityItemResponse,
  DeckCardResponse,
  DeckResponse,
  SourceResponse,
  TradeListItemDetailResponse,
  TradeListItemResponse,
  TradeListResponse,
  WishListItemResponse,
  WishListResponse,
} from "@openrift/shared";
import { formatDateUTC } from "@openrift/shared";
import { activityTypeSchema } from "@openrift/shared/schemas";
import type { Selectable } from "kysely";

import type {
  ActivitiesTable,
  CollectionsTable,
  DecksTable,
  SourcesTable,
  TradeListItemsTable,
  TradeListsTable,
  WishListItemsTable,
  WishListsTable,
} from "../db/index.js";

// ── Simple entity mappers ──────────────────────────────────────────────────

export function toCollection(row: Selectable<CollectionsTable>): CollectionResponse {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    availableForDeckbuilding: row.availableForDeckbuilding,
    isInbox: row.isInbox,
    sortOrder: row.sortOrder,
    shareToken: row.shareToken,
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

export function toSource(row: Selectable<SourcesTable>): SourceResponse {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toTradeList(row: Selectable<TradeListsTable>): TradeListResponse {
  return {
    id: row.id,
    name: row.name,
    rules: row.rules,
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
    rules: row.rules,
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

export function toActivity(row: Selectable<ActivitiesTable>): ActivityResponse {
  return {
    id: row.id,
    type: activityTypeSchema.parse(row.type),
    name: row.name,
    date: formatDateUTC(row.date),
    description: row.description,
    isAuto: row.isAuto,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ── Composite / detail mappers ─────────────────────────────────────────────

/**
 * Maps a denormalized copy row (from joins) to CopyResponse.
 * @returns The serialized copy response.
 */
export function toCopy(row: {
  id: string;
  printingId: string;
  collectionId: string;
  sourceId: string | null;
  cardId: string;
  setId: string;
  collectorNumber: number;
  rarity: string;
  artVariant: string;
  isSigned: boolean;
  finish: string;
  imageUrl: string | null;
  artist: string | null;
  cardName: string;
  cardType: string;
  createdAt: Date;
  updatedAt: Date;
}): CopyResponse {
  return {
    id: row.id,
    printingId: row.printingId,
    collectionId: row.collectionId,
    sourceId: row.sourceId,
    cardId: row.cardId,
    setId: row.setId,
    collectorNumber: row.collectorNumber,
    rarity: row.rarity,
    artVariant: row.artVariant,
    isSigned: row.isSigned,
    finish: row.finish,
    imageUrl: row.imageUrl,
    artist: row.artist,
    cardName: row.cardName,
    cardType: row.cardType,
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
  domains: string[];
  energy: number | null;
  might: number | null;
  power: number | null;
}): DeckCardResponse {
  return {
    id: row.id,
    deckId: row.deckId,
    cardId: row.cardId,
    zone: row.zone as DeckCardResponse["zone"],
    quantity: row.quantity,
    cardName: row.cardName,
    cardType: row.cardType as DeckCardResponse["cardType"],
    domains: row.domains as DeckCardResponse["domains"],
    energy: row.energy,
    might: row.might,
    power: row.power,
  };
}

/**
 * Maps a denormalized activity item row to ActivityItemResponse.
 * @returns The serialized activity item response.
 */
export function toActivityItem(row: {
  id: string;
  activityId: string;
  activityType: string;
  copyId: string | null;
  printingId: string;
  action: string;
  fromCollectionId: string | null;
  fromCollectionName: string | null;
  toCollectionId: string | null;
  toCollectionName: string | null;
  metadataSnapshot: unknown;
  createdAt: Date;
  setId: string;
  collectorNumber: number;
  rarity: string;
  imageUrl: string | null;
  cardName: string;
  cardType: string;
}): ActivityItemResponse {
  return {
    id: row.id,
    activityId: row.activityId,
    activityType: row.activityType as ActivityItemResponse["activityType"],
    copyId: row.copyId,
    printingId: row.printingId,
    action: row.action as ActivityItemResponse["action"],
    fromCollectionId: row.fromCollectionId,
    fromCollectionName: row.fromCollectionName,
    toCollectionId: row.toCollectionId,
    toCollectionName: row.toCollectionName,
    metadataSnapshot: row.metadataSnapshot,
    createdAt: row.createdAt.toISOString(),
    setId: row.setId,
    collectorNumber: row.collectorNumber,
    rarity: row.rarity as ActivityItemResponse["rarity"],
    imageUrl: row.imageUrl,
    cardName: row.cardName,
    cardType: row.cardType as ActivityItemResponse["cardType"],
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
