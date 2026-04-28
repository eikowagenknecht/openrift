import type {
  CardType,
  CollectionEventResponse,
  CollectionResponse,
  CopyResponse,
  DeckAvailabilityItemResponse,
  DeckCardResponse,
  DeckResponse,
  DeckSummaryResponse,
  Domain,
  PublicDeckCardResponse,
  PublicDeckResponse,
  SuperType,
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
    isPinned: row.isPinned,
    archivedAt: row.archivedAt?.toISOString() ?? null,
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
    isPinned: row.isPinned,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** @returns Public-facing deck fields — excludes shareToken, isPublic, and userId. */
export function toPublicDeck(row: Selectable<DecksTable>): PublicDeckResponse {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
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
  imageId: string | null;
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
    imageId: row.imageId,
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
}): CopyResponse {
  return {
    id: row.id,
    printingId: row.printingId,
    collectionId: row.collectionId,
  };
}

/**
 * Maps a denormalized deck card row to DeckCardResponse.
 * @returns The serialized deck card response.
 */
export function toDeckCard(row: {
  cardId: string;
  zone: string;
  quantity: number;
  preferredPrintingId: string | null;
}): DeckCardResponse {
  return {
    cardId: row.cardId,
    zone: row.zone as DeckCardResponse["zone"],
    quantity: row.quantity,
    preferredPrintingId: row.preferredPrintingId,
  };
}

/**
 * Composes an enriched public-deck card from the raw deck-card row, the
 * card's catalog row, and the resolved printing meta. The public share-deck
 * endpoint denormalizes this so the share page can SSR without pulling the
 * global catalog.
 *
 * @returns The serialized public deck card response.
 */
export function toPublicDeckCard(
  deckCard: { cardId: string; zone: string; quantity: number; preferredPrintingId: string | null },
  cardMeta: {
    name: string;
    slug: string;
    type: CardType;
    superTypes: SuperType[];
    domains: Domain[];
    tags: string[];
    keywords: string[];
    energy: number | null;
    might: number | null;
    power: number | null;
  },
  printingMeta: {
    resolvedPrintingId: string | null;
    shortCode: string | null;
    imageId: string | null;
  },
): PublicDeckCardResponse {
  return {
    cardId: deckCard.cardId,
    zone: deckCard.zone as PublicDeckCardResponse["zone"],
    quantity: deckCard.quantity,
    preferredPrintingId: deckCard.preferredPrintingId,
    cardName: cardMeta.name,
    cardSlug: cardMeta.slug,
    cardType: cardMeta.type,
    superTypes: cardMeta.superTypes,
    domains: cardMeta.domains,
    tags: cardMeta.tags,
    keywords: cardMeta.keywords,
    energy: cardMeta.energy,
    might: cardMeta.might,
    power: cardMeta.power,
    resolvedPrintingId: printingMeta.resolvedPrintingId,
    shortCode: printingMeta.shortCode,
    imageId: printingMeta.imageId,
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
  imageId: string | null;
  setId: string;
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
    imageId: row.imageId,
    setId: row.setId,
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
