import type { TimeRange } from "@openrift/shared/types/pricing";

export const collectionsKeys = {
  all: (userId: string) => ["collections", userId] as const,
  publicByToken: (token: string) => ["collections", "share", token] as const,
  groupShares: (userId: string, id: string) => ["collections", userId, id, "group-shares"] as const,
} as const;

export const copiesKeys = {
  all: (userId: string) => ["copies", userId] as const,
  // The react-db copies store's queryFn re-reads `copies.all`, so
  // invalidate BOTH keys to sync fresh rows into the store.
  syncedStore: (userId: string) => ["copies-collection", userId] as const,
  byCollection: (userId: string, id: string) => ["copies", userId, id] as const,
  listMemberships: (userId: string, copyIds: readonly string[], excludeListId?: string) =>
    ["copies", userId, "list-memberships", copyIds, excludeListId ?? null] as const,
} as const;

export const collectionEventsKeys = {
  all: (userId: string) => ["collection-events", userId] as const,
} as const;

export const collectionValueHistoryKeys = {
  byParams: (
    userId: string,
    marketplace: string,
    range: TimeRange,
    collectionId?: string,
    scope?: string,
  ) => ["collectionValueHistory", userId, marketplace, range, collectionId, scope] as const,
} as const;
