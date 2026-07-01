import type {
  publicUserBundleCollectionResponseSchema,
  publicUserBundleListResponseSchema,
  publicUserBundleResponseSchema,
} from "@openrift/shared/contracts/public-user-share";
import type { userShareStateResponseSchema } from "@openrift/shared/contracts/user-share";
import type { z } from "zod";

/**
 * State of the signed-in user's public share bundle. `shareToken` is `null`
 * when bundle sharing is disabled; `isPublic` mirrors `shareToken !== null` so
 * this shares the `{ shareToken, isPublic }` shape with the collection/deck/list
 * share-state responses. See ADR-018.
 */
export type UserShareStateResponse = z.infer<typeof userShareStateResponseSchema>;

/**
 * One row in the bundle's public index. `isPublic` is true when the
 * list has its own per-list public share token. `viaGroups` lists the friend
 * groups the viewer is a member of that the list is shared with — empty for
 * anonymous viewers, populated for authenticated viewers. At least one of
 * the two visibility signals is always true (otherwise the row would not
 * appear in the bundle response at all).
 */
export type PublicUserBundleListResponse = z.infer<typeof publicUserBundleListResponseSchema>;

/**
 * One row in the bundle's collection index. Group-only: collections never
 * have a per-collection public share token in the bundle context (the
 * `/collections/share/:token` page handles that separately). `viaGroups` is
 * always non-empty when this row appears.
 */
export type PublicUserBundleCollectionResponse = z.infer<
  typeof publicUserBundleCollectionResponseSchema
>;

/**
 * Public payload for `GET /api/v1/users/share/:token`. Owner profile is
 * disclosed by design (a recipient pasting the link into a chat must be able
 * to tell whose lists they are seeing); the email itself stays server-side
 * and only its Gravatar hash is exposed.
 *
 * `collections` is only populated when the viewer is authenticated and is a
 * member of a friend group the owner has shared one or more collections to;
 * anonymous viewers always see an empty array.
 */
export type PublicUserBundleResponse = z.infer<typeof publicUserBundleResponseSchema>;
