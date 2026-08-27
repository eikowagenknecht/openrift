import { oc } from "@orpc/contract";

import {
  friendGroupCodeQuerySchema,
  friendGroupJoinPreviewResponseSchema,
} from "./friend-groups.js";

/**
 * The anonymous half of joining a group by code. `joinPreview` answers "what am
 * I being invited to" before there is a session, so a code link can show the
 * group's name instead of a bare login wall; `join` itself stays authenticated
 * on the friend-groups contract, because a request needs an account to belong
 * to.
 *
 * The code is the capability, and at 12 base62 characters it is the same class
 * of secret as the share tokens on the other public reads. What it reveals is
 * deliberately what an invited person needs and no more: name, description,
 * member count. Never the roster.
 *
 * Not cached: `viewerStatus` is per-viewer, resolved from the session when
 * there is one and reported as `"available"` when there isn't, so the landing
 * can tell an already-joined member from a newcomer without a second trip.
 */
export const publicFriendGroupsContract = {
  joinPreview: oc
    .route({ method: "GET", path: "/api/v1/friend-groups/preview", tags: ["FriendGroups"] })
    .meta({ auth: "public" })
    .input(friendGroupCodeQuerySchema)
    .errors({ NOT_FOUND: { message: "Group not found" } })
    .output(friendGroupJoinPreviewResponseSchema),
};

export type PublicFriendGroupsContract = typeof publicFriendGroupsContract;
