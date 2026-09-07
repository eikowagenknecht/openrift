import type {
  publicUserBundleCollectionResponseSchema,
  publicUserBundleListResponseSchema,
  publicUserBundleResponseSchema,
} from "@openrift/shared/contracts/public-user-share";
import type { userShareStateResponseSchema } from "@openrift/shared/contracts/user-share";
import type { z } from "zod";

/**
 * `shareToken` is `null` when bundle sharing is disabled; `isPublic` mirrors
 * `shareToken !== null`.
 */
export type UserShareStateResponse = z.infer<typeof userShareStateResponseSchema>;

/**
 * At least one of `isPublic` and `viaGroups` is always truthy, otherwise the
 * row would not appear in the bundle response at all.
 */
export type PublicUserBundleListResponse = z.infer<typeof publicUserBundleListResponseSchema>;

/** Group-only: collections never carry a per-collection public share token here. */
export type PublicUserBundleCollectionResponse = z.infer<
  typeof publicUserBundleCollectionResponseSchema
>;

/**
 * `collections` is populated only when the viewer is authenticated and a
 * member of a friend group the owner shared collections to.
 */
export type PublicUserBundleResponse = z.infer<typeof publicUserBundleResponseSchema>;
