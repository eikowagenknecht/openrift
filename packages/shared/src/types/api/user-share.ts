import type { ListIntent, ListKind } from "./list.js";

/**
 * State of the signed-in user's public share bundle. `shareToken` is `null`
 * when bundle sharing is disabled. See ADR-018.
 */
export interface UserShareStateResponse {
  shareToken: string | null;
}

/**
 * One row in the bundle's public index. `isPubliclyShared` is true when the
 * list has its own per-list public share token. `viaGroups` lists the friend
 * groups the viewer is a member of that the list is shared with — empty for
 * anonymous viewers, populated for authenticated viewers. At least one of
 * the two visibility signals is always true (otherwise the row would not
 * appear in the bundle response at all).
 */
export interface PublicUserBundleListResponse {
  id: string;
  name: string;
  intent: ListIntent;
  kind: ListKind;
  entryCount: number;
  isPubliclyShared: boolean;
  viaGroups: { id: string; slug: string; name: string }[];
  createdAt: string;
  updatedAt: string;
}

/**
 * One row in the bundle's collection index. Group-only: collections never
 * have a per-collection public share token in the bundle context (the
 * `/collections/share/:token` page handles that separately). `viaGroups` is
 * always non-empty when this row appears.
 */
export interface PublicUserBundleCollectionResponse {
  id: string;
  name: string;
  description: string | null;
  viaGroups: { id: string; slug: string; name: string }[];
}

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
export interface PublicUserBundleResponse {
  owner: {
    displayName: string;
    gravatarHash: string;
  };
  lists: PublicUserBundleListResponse[];
  collections: PublicUserBundleCollectionResponse[];
}
