import type {
  CollectionEventResponse,
  CollectionResponse,
  PublicCollectionResponse,
} from "@openrift/shared";
import type { Selectable } from "kysely";

import type { CollectionsTable } from "../db/index.js";
import type { CollectionValue } from "../repositories/marketplace.js";

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
  /**
   * The viewer's sidebar visibility choice (`COALESCE(sidebar.hidden, false)`).
   * Per-viewer like `availableForDeckbuilding`; callers that don't join the
   * prefs table leave it unset and the collection presents as visible.
   */
  sidebarHidden?: boolean;
  copyCount?: number;
  groupSlug?: string | null;
  groupName?: string | null;
  viewerCanAdmin?: boolean;
};

/** A deck stored in this collection, as named by {@link CollectionResponse.homeDecks}. */
export interface HomeDeck {
  id: string;
  name: string;
}

export function toCollection(
  row: CollectionViewRow,
  value?: CollectionValue,
  homeDecks?: readonly HomeDeck[],
): CollectionResponse {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    availableForDeckbuilding: row.availableForDeckbuilding,
    sidebarHidden: row.sidebarHidden ?? false,
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
    // Callers that don't resolve deck boxes present the collection as holding
    // none, rather than claiming a deck it can't confirm.
    homeDecks: homeDecks ? [...homeDecks] : [],
  };
}

/** Public-facing collection fields — excludes shareToken, isPublic, isInbox, sortOrder, availableForDeckbuilding. */
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
  cardTypes: string[];
  cardSuperTypes: string[];
  tags: string[];
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
    cardTypes: row.cardTypes as CollectionEventResponse["cardTypes"],
    cardSuperTypes: row.cardSuperTypes,
    tags: row.tags,
  };
}
