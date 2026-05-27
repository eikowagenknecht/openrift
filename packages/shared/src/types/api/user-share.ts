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
 * Public payload for `GET /api/v1/users/share/:token`. Owner profile is
 * disclosed by design (a recipient pasting the link into a chat must be able
 * to tell whose lists they are seeing); the email itself stays server-side
 * and only its Gravatar hash is exposed.
 */
export interface PublicUserBundleResponse {
  owner: {
    displayName: string;
    gravatarHash: string;
  };
  lists: PublicUserBundleListResponse[];
}
