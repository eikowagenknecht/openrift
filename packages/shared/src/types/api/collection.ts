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
  copies: PublicCopyResponse[];
  nextCursor: string | null;
  owner: { displayName: string };
}

/**
 * A copy as seen by an anonymous share viewer. Deliberately narrower than
 * {@link CopyResponse}: `groupId` and `collectionId` are owner-internal and are
 * not exposed to unauthenticated viewers (CPL-1). Public consumers only need
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
 * Response body for `POST /copies`: the copies just created, each in the full
 * {@link CopyResponse} shape (including `groupId` derived from the owning
 * collection, so clients no longer have to synthesize it).
 */
export type CopyAddResponse = CopyResponse[];
