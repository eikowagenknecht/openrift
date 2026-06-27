export interface CollectionResponse {
  id: string;
  name: string;
  description: string | null;
  availableForDeckbuilding: boolean;
  isInbox: boolean;
  sortOrder: number;
  isPublic: boolean;
  shareToken: string | null;
  copyCount: number;
  totalValueCents: number | null;
  unpricedCopyCount: number | null;
  createdAt: string;
  updatedAt: string;
  groupId: string | null;
  groupSlug: string | null;
  groupName: string | null;
  viewerCanAdmin: boolean;
}

export interface CollectionListResponse {
  items: CollectionResponse[];
}

/**
 * Response body for collection create/update: the collection plus the
 * Postgres transaction id (32-bit xid) of the write, as tagged on the
 * Electric replication stream. The client awaits this txid on its synced
 * collections shape to know when the optimistic row has round-tripped
 * (ADR-027 step 2).
 */
export interface CollectionWriteResponse extends CollectionResponse {
  txid: number;
}

/**
 * Response body for collection mutations that previously returned 204
 * (delete, reorder): just the Postgres transaction id of the change, so the
 * client can await it on the Electric stream (ADR-027 step 2).
 */
export interface CollectionMutationResponse {
  txid: number;
}

export interface PublicCollectionResponse {
  id: string;
  name: string;
  description: string | null;
  copyCount: number;
  totalValueCents: number | null;
  unpricedCopyCount: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicCollectionDetailResponse {
  collection: PublicCollectionResponse;
  items: PublicCopyResponse[];
  nextCursor: string | null;
  // gravatarHash is null for group-owned collections (a group has no email).
  owner: { displayName: string; gravatarHash: string | null };
}

/**
 * A copy as seen by an anonymous share viewer. Deliberately narrower than
 * {@link CopyResponse}: `groupId` and `collectionId` are owner-internal and are
 * not exposed to unauthenticated viewers. Public consumers only need
 * the printing to tally counts.
 */
export interface PublicCopyResponse {
  id: string;
  printingId: string;
}

export interface CollectionShareResponse {
  shareToken: string | null;
  isPublic: boolean;
}

export interface CopyListResponse {
  items: CopyResponse[];
  nextCursor: string | null;
}

export interface CopyCollectionBreakdownEntry {
  collectionId: string;
  collectionName: string;
  count: number;
}

export interface CopyResponse {
  id: string;
  printingId: string;
  collectionId: string;
  /**
   * Owning group of the copy's collection, or null for personal collections.
   * Lets the client keep group-owned copies out of personal "owned" totals
   * while still showing them inside the group collection.
   */
  groupId: string | null;
}

/**
 * Response body for `POST /copies`: the copies just created under an `items`
 * key (matching the `{ items }` list envelope used everywhere else), each in the
 * full {@link CopyResponse} shape (including `groupId` derived from the owning
 * collection, so clients no longer have to synthesize it).
 */
export interface CopyAddResponse {
  items: CopyResponse[];
  /**
   * Postgres transaction id (32-bit xid) of the insert, as tagged on the
   * Electric replication stream. The client awaits this txid on its synced
   * copies collection to know when the optimistic rows have round-tripped
   * (ADR-027 step 2).
   */
  txid: number;
}

/**
 * Response body for copy mutations that previously returned 204 (move,
 * dispose): just the Postgres transaction id of the change, so the client can
 * await it on the Electric stream (ADR-027 step 2).
 */
export interface CopyMutationResponse {
  txid: number;
}

export interface CopyListMembershipEntry {
  id: string;
  name: string;
  copyCount: number;
}

/**
 * Which of the viewer's own lists reference a set of copies. Drives the dispose
 * confirmation's cross-list warning: disposing hard-deletes the copies, so they
 * also vanish from every list here. `copiesOnAnyList` is the distinct count of
 * queried copies on at least one list (a copy can sit on several lists).
 */
export interface CopyListMembershipsResponse {
  lists: CopyListMembershipEntry[];
  copiesOnAnyList: number;
}
