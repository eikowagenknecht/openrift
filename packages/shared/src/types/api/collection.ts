import type {
  collectionListResponseSchema,
  collectionMutationResponseSchema,
  collectionResponseSchema,
  collectionShareResponseSchema,
  collectionWriteResponseSchema,
} from "@openrift/shared/contracts/collections";
import type {
  copyAddResponseSchema,
  copyListMembershipsResponseSchema,
  copyMetadataPatchSchema,
  copyMutationResponseSchema,
} from "@openrift/shared/contracts/copies";
import type {
  publicCollectionDetailResponseSchema,
  publicCollectionResponseSchema,
  publicCopyResponseSchema,
} from "@openrift/shared/contracts/public-collections";
import type { copyLinkSchema, copyListResponseSchema } from "@openrift/shared/response-schemas";
import type { z } from "zod";

export type CollectionResponse = z.infer<typeof collectionResponseSchema>;

export type CollectionListResponse = z.infer<typeof collectionListResponseSchema>;

/**
 * Response body for collection create/update: the collection plus the
 * Postgres transaction id (32-bit xid) of the write, as tagged on the
 * Electric replication stream. The client awaits this txid on its synced
 * collections shape to know when the optimistic row has round-tripped
 * (ADR-027 step 2).
 */
export type CollectionWriteResponse = z.infer<typeof collectionWriteResponseSchema>;

/**
 * Response body for collection mutations that previously returned 204
 * (delete, reorder): just the Postgres transaction id of the change, so the
 * client can await it on the Electric stream (ADR-027 step 2).
 */
export type CollectionMutationResponse = z.infer<typeof collectionMutationResponseSchema>;

export type PublicCollectionResponse = z.infer<typeof publicCollectionResponseSchema>;

export type PublicCollectionDetailResponse = z.infer<typeof publicCollectionDetailResponseSchema>;

/**
 * A copy as seen by an anonymous share viewer. Deliberately narrower than
 * {@link CopyResponse}: `groupId` and `collectionId` are owner-internal and are
 * not exposed to unauthenticated viewers. Public consumers only need
 * the printing to tally counts.
 */
export type PublicCopyResponse = z.infer<typeof publicCopyResponseSchema>;

export type CollectionShareResponse = z.infer<typeof collectionShareResponseSchema>;

export type CopyListResponse = z.infer<typeof copyListResponseSchema>;

/** One photo/video link on a copy (ADR-038). */
export type CopyLink = z.infer<typeof copyLinkSchema>;

/**
 * Partial metadata patch for `copies.update`. Absent keys stay untouched;
 * explicit nulls clear the field.
 */
export type CopyMetadataPatch = z.infer<typeof copyMetadataPatchSchema>;

export interface CopyCollectionBreakdownEntry {
  collectionId: string;
  collectionName: string;
  count: number;
}

/**
 * A single owned physical copy. `groupId` is the owning group of the copy's
 * collection, or null for personal collections — lets the client keep
 * group-owned copies out of personal "owned" totals while still showing them
 * inside the group collection.
 */
export type CopyResponse = z.infer<typeof copyAddResponseSchema>["items"][number];

/**
 * Response body for `POST /copies`: the copies just created under an `items`
 * key (matching the `{ items }` list envelope used everywhere else), each in the
 * full {@link CopyResponse} shape (including `groupId` derived from the owning
 * collection, so clients no longer have to synthesize it).
 */
export type CopyAddResponse = z.infer<typeof copyAddResponseSchema>;

/**
 * Response body for copy mutations that previously returned 204 (move,
 * dispose): just the Postgres transaction id of the change, so the client can
 * await it on the Electric stream (ADR-027 step 2).
 */
export type CopyMutationResponse = z.infer<typeof copyMutationResponseSchema>;

export type CopyListMembershipEntry = z.infer<
  typeof copyListMembershipsResponseSchema
>["lists"][number];

/**
 * Which of the viewer's own lists reference a set of copies. Drives the dispose
 * confirmation's cross-list warning: disposing hard-deletes the copies, so they
 * also vanish from every list here. `copiesOnAnyList` is the distinct count of
 * queried copies on at least one list (a copy can sit on several lists).
 */
export type CopyListMembershipsResponse = z.infer<typeof copyListMembershipsResponseSchema>;
