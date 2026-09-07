import type {
  clearCollectionResponseSchema,
  collectionListResponseSchema,
  collectionResponseSchema,
  collectionShareResponseSchema,
  resetCollectionsResponseSchema,
} from "@openrift/shared/contracts/collections";
import type {
  copyAddResponseSchema,
  copyListMembershipsResponseSchema,
  copyMetadataPatchSchema,
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

export type PublicCollectionResponse = z.infer<typeof publicCollectionResponseSchema>;

export type PublicCollectionDetailResponse = z.infer<typeof publicCollectionDetailResponseSchema>;

/** `groupId` and `collectionId` are owner-internal and not exposed to unauthenticated viewers. */
export type PublicCopyResponse = z.infer<typeof publicCopyResponseSchema>;

export type CollectionShareResponse = z.infer<typeof collectionShareResponseSchema>;

/** Copies that stay because a live trade or loan pins them are reported by id. */
export type ClearCollectionResponse = z.infer<typeof clearCollectionResponseSchema>;

export type ResetCollectionsResponse = z.infer<typeof resetCollectionsResponseSchema>;

export type CopyListResponse = z.infer<typeof copyListResponseSchema>;

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

/** `groupId` is the owning group of the copy's collection, or null for personal collections. */
export type CopyResponse = z.infer<typeof copyAddResponseSchema>["items"][number];

export type CopyAddResponse = z.infer<typeof copyAddResponseSchema>;

export type CopyListMembershipEntry = z.infer<
  typeof copyListMembershipsResponseSchema
>["lists"][number];

/** `copiesOnAnyList` is the distinct count of queried copies on at least one list. */
export type CopyListMembershipsResponse = z.infer<typeof copyListMembershipsResponseSchema>;
