import { oc } from "@orpc/contract";

import {
  friendGroupCodeQuerySchema,
  friendGroupJoinPreviewResponseSchema,
} from "./friend-groups.js";

/** Deliberately exposes only name, description and member count; never the roster. Not cached: `viewerStatus` is per-viewer. */
export const publicFriendGroupsContract = {
  joinPreview: oc
    .route({ method: "GET", path: "/api/v1/friend-groups/preview", tags: ["FriendGroups"] })
    .meta({ auth: "public" })
    .input(friendGroupCodeQuerySchema)
    .errors({ NOT_FOUND: { message: "Group not found" } })
    .output(friendGroupJoinPreviewResponseSchema),
};

export type PublicFriendGroupsContract = typeof publicFriendGroupsContract;
