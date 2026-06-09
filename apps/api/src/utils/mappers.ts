import type {
  CardType,
  CollectionEventResponse,
  CollectionResponse,
  CopyResponse,
  PublicCopyResponse,
  DeckAvailabilityItemResponse,
  DeckCardResponse,
  DeckResponse,
  DeckSummaryResponse,
  Domain,
  Finish,
  ListEntryDetailResponse,
  ListEntryResponse,
  ListResponse,
  PublicCollectionResponse,
  PublicDeckCardResponse,
  PublicDeckResponse,
  PublicListResponse,
  Rarity,
  SuperType,
  TradePreference,
} from "@openrift/shared";
import type { Selectable } from "kysely";

import type { CollectionsTable, DecksTable, ListEntriesTable, ListsTable } from "../db/index.js";
import type { CollectionValue } from "../repositories/marketplace.js";

const EMPTY_TRADE_PREFERENCE: TradePreference = {
  pricePref: null,
  priceAbsoluteCents: null,
  tradeType: null,
};

function tradeDefaultsFromList(
  row: Pick<
    Selectable<ListsTable>,
    "defaultPricePref" | "defaultPriceAbsoluteCents" | "defaultTradeType"
  >,
): TradePreference {
  if (
    row.defaultPricePref === null &&
    row.defaultPriceAbsoluteCents === null &&
    row.defaultTradeType === null
  ) {
    return EMPTY_TRADE_PREFERENCE;
  }
  return {
    pricePref: row.defaultPricePref,
    priceAbsoluteCents: row.defaultPriceAbsoluteCents,
    tradeType: row.defaultTradeType,
  };
}

function tradeOverrideFromEntry(
  row: Pick<Selectable<ListEntriesTable>, "pricePref" | "priceAbsoluteCents" | "tradeType">,
): TradePreference {
  if (row.pricePref === null && row.priceAbsoluteCents === null && row.tradeType === null) {
    return EMPTY_TRADE_PREFERENCE;
  }
  return {
    pricePref: row.pricePref,
    priceAbsoluteCents: row.priceAbsoluteCents,
    tradeType: row.tradeType,
  };
}

// ── Simple entity mappers ──────────────────────────────────────────────────

/**
 * Row shape consumed by {@link toCollection}. Personal collections set group
 * fields to null and `viewerCanAdmin` to true (only the owner can fetch them).
 * Shared collections set groupId/Slug/Name and compute viewerCanAdmin from the
 * caller's group role.
 */
export type CollectionViewRow = Selectable<CollectionsTable> & {
  /**
   * The viewer's effective deck-building availability. Derived per-viewer
   * (`COALESCE(pref.available, group_id IS NULL)`), not stored on the
   * collection — callers must supply it.
   */
  availableForDeckbuilding: boolean;
  copyCount?: number;
  groupSlug?: string | null;
  groupName?: string | null;
  viewerCanAdmin?: boolean;
};

export function toCollection(row: CollectionViewRow, value?: CollectionValue): CollectionResponse {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    availableForDeckbuilding: row.availableForDeckbuilding,
    isInbox: row.isInbox,
    sortOrder: row.sortOrder,
    isPublic: row.isPublic,
    shareToken: row.shareToken,
    copyCount: row.copyCount ?? 0,
    totalValueCents: value?.totalValueCents ?? null,
    unpricedCopyCount: value?.unpricedCopyCount ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    groupId: row.groupId,
    groupSlug: row.groupSlug ?? null,
    groupName: row.groupName ?? null,
    viewerCanAdmin: row.viewerCanAdmin ?? row.userId !== null,
  };
}

/** @returns Public-facing collection fields — excludes shareToken, isPublic, isInbox, sortOrder, availableForDeckbuilding. */
export function toPublicCollection(
  row: Selectable<CollectionsTable> & { copyCount?: number },
  value?: CollectionValue,
): PublicCollectionResponse {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
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
    formatConfig: row.formatConfig,
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
    formatConfig: row.formatConfig,
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
    formatConfig: row.formatConfig,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toList(row: Selectable<ListsTable> & { entryCount?: number }): ListResponse {
  return {
    id: row.id,
    name: row.name,
    intent: row.intent,
    kind: row.kind,
    entryCount: row.entryCount ?? 0,
    isPublic: row.isPublic,
    shareToken: row.shareToken,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    tradeDefaults: tradeDefaultsFromList(row),
    currency: row.currency,
  };
}

/** @returns Public-facing list fields — excludes shareToken, isPublic, userId. */
export function toPublicList(row: Selectable<ListsTable>): PublicListResponse {
  return {
    id: row.id,
    name: row.name,
    intent: row.intent,
    kind: row.kind,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    tradeDefaults: tradeDefaultsFromList(row),
    currency: row.currency,
  };
}

/**
 * Maps a raw list-entry row (wide nullable shape from the DB) to the bare
 * discriminated response. The kind column tells us which of
 * cardId/printingId/copyId is non-null per `chk_list_entries_kind_shape`.
 * @returns The narrowed list entry response.
 */
export function toListEntry(row: Selectable<ListEntriesTable>): ListEntryResponse {
  const base = {
    id: row.id,
    listId: row.listId,
    quantity: row.quantity,
    tradeOverride: tradeOverrideFromEntry(row),
  };
  if (row.kind === "card") {
    return { ...base, kind: "card", cardId: row.cardId as string };
  }
  if (row.kind === "printing") {
    return { ...base, kind: "printing", printingId: row.printingId as string };
  }
  return { ...base, kind: "copy", copyId: row.copyId as string };
}

/**
 * Maps an enriched list-entry row to the discriminated detail response. The
 * repo's per-kind queries already produce the right variant — this mapper
 * just narrows the union for the route handler.
 * @returns The serialized list entry detail response.
 */
export function toListEntryDetail(
  row:
    | {
        kind: "card";
        id: string;
        listId: string;
        quantity: number;
        cardId: string;
        cardName: string;
        cardType: string;
        tradeOverride: TradePreference;
      }
    | {
        kind: "printing";
        id: string;
        listId: string;
        quantity: number;
        printingId: string;
        cardName: string;
        cardType: string;
        setId: string;
        rarity: string;
        finish: string;
        shortCode: string;
        language: string;
        imageId: string | null;
        tradeOverride: TradePreference;
      }
    | {
        kind: "copy";
        id: string;
        listId: string;
        quantity: number;
        copyId: string;
        printingId: string;
        collectionId: string;
        cardName: string;
        cardType: string;
        setId: string;
        rarity: string;
        finish: string;
        shortCode: string;
        language: string;
        imageId: string | null;
        tradeOverride: TradePreference;
      },
): ListEntryDetailResponse {
  if (row.kind === "card") {
    return {
      kind: "card",
      id: row.id,
      listId: row.listId,
      quantity: row.quantity,
      cardId: row.cardId,
      cardName: row.cardName,
      cardType: row.cardType as CardType,
      tradeOverride: row.tradeOverride,
    };
  }
  if (row.kind === "printing") {
    return {
      kind: "printing",
      id: row.id,
      listId: row.listId,
      quantity: row.quantity,
      printingId: row.printingId,
      cardName: row.cardName,
      cardType: row.cardType as CardType,
      setId: row.setId,
      rarity: row.rarity as Rarity,
      finish: row.finish as Finish,
      shortCode: row.shortCode,
      language: row.language,
      imageId: row.imageId,
      tradeOverride: row.tradeOverride,
    };
  }
  return {
    kind: "copy",
    id: row.id,
    listId: row.listId,
    quantity: row.quantity,
    copyId: row.copyId,
    printingId: row.printingId,
    // collectionId is owner-internal: it identified the owner's collection that
    // holds the copy, but it is never consumed by clients and it leaked to
    // anonymous viewers of public/group-shared lists (G3). Dropped from the wire.
    cardName: row.cardName,
    cardType: row.cardType as CardType,
    setId: row.setId,
    rarity: row.rarity as Rarity,
    finish: row.finish as Finish,
    shortCode: row.shortCode,
    language: row.language,
    imageId: row.imageId,
    tradeOverride: row.tradeOverride,
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
  groupId: string | null;
}): CopyResponse {
  return {
    id: row.id,
    printingId: row.printingId,
    collectionId: row.collectionId,
    groupId: row.groupId,
  };
}

/**
 * Maps a copy row to the narrower public projection for anonymous share
 * viewers — withholds the owner-internal `groupId`/`collectionId`.
 * @returns The serialized public copy response.
 */
export function toPublicCopy(row: { id: string; printingId: string }): PublicCopyResponse {
  return {
    id: row.id,
    printingId: row.printingId,
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
