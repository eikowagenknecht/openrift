import { oc } from "@orpc/contract";
import { z } from "zod";

import {
  friendGroupActivityResponseSchema,
  friendGroupDetailResponseSchema,
  friendGroupJoinPreviewResponseSchema,
  friendGroupListResponseSchema,
  friendGroupMatchesResponseSchema,
  friendGroupMemberDetailResponseSchema,
  friendGroupMemberResponseSchema,
  friendGroupPendingInvitesCountResponseSchema,
  friendGroupPendingRequestsCountResponseSchema,
  friendGroupResponseSchema,
  friendGroupShareableCollectionsResponseSchema,
  friendGroupShareableListsResponseSchema,
  friendGroupSharedCollectionDetailResponseSchema,
  friendGroupSharedListDetailResponseSchema,
} from "../response-schemas.js";
import {
  createFriendGroupSchema,
  friendGroupCodeQuerySchema,
  friendGroupInviteByEmailSchema,
  friendGroupJoinByCodeSchema,
  friendGroupShareCollectionSchema,
  friendGroupShareListSchema,
  friendGroupSlugAndCollectionIdParamSchema,
  friendGroupSlugAndListIdParamSchema,
  friendGroupSlugAndUserParamSchema,
  friendGroupSlugParamSchema,
  friendGroupTransferOwnershipSchema,
  friendGroupUpdateRoleSchema,
  setRevealedContactsSchema,
  updateFriendGroupSchema,
  withParams,
} from "../schemas.js";

const TAG = "Friend Groups";

const FG = "/api/v1/friend-groups";

/**
 * oRPC contract for the friend-groups endpoints (mounted at
 * `/api/v1/friend-groups`). All require a session. Role checks, not-found,
 * conflict, and bad-request states are thrown as `AppError` and bridged to
 * ORPCErrors in the implementation, so the contract declares no per-code typed
 * errors. The static single-segment paths (pending-*-count, preview, join)
 * take precedence over `{slug}`.
 *
 * `updateGroup` uses the detailed input structure because the path `slug`
 * (current) and the optional body `slug` (rename target) would otherwise
 * collide under the compact merge.
 */
export const friendGroupsContract = {
  list: oc.route({ method: "GET", path: FG, tags: [TAG] }).output(friendGroupListResponseSchema),
  pendingInvitesCount: oc
    .route({ method: "GET", path: `${FG}/pending-invites-count`, tags: [TAG] })
    .output(friendGroupPendingInvitesCountResponseSchema),
  pendingRequestsCount: oc
    .route({ method: "GET", path: `${FG}/pending-requests-count`, tags: [TAG] })
    .output(friendGroupPendingRequestsCountResponseSchema),
  create: oc
    .route({ method: "POST", path: FG, tags: [TAG], successStatus: 201 })
    .input(createFriendGroupSchema)
    .output(friendGroupResponseSchema),
  preview: oc
    .route({ method: "GET", path: `${FG}/preview`, tags: [TAG] })
    .input(friendGroupCodeQuerySchema)
    .output(friendGroupJoinPreviewResponseSchema),
  join: oc
    .route({ method: "POST", path: `${FG}/join`, tags: [TAG], successStatus: 202 })
    .input(friendGroupJoinByCodeSchema),
  get: oc
    .route({ method: "GET", path: `${FG}/{slug}`, tags: [TAG] })
    .input(friendGroupSlugParamSchema)
    .output(friendGroupDetailResponseSchema),
  update: oc
    .route({ method: "PATCH", path: `${FG}/{slug}`, tags: [TAG], inputStructure: "detailed" })
    .input(z.object({ params: friendGroupSlugParamSchema, body: updateFriendGroupSchema }))
    .output(friendGroupResponseSchema),
  remove: oc
    .route({ method: "DELETE", path: `${FG}/{slug}`, tags: [TAG], successStatus: 204 })
    .input(friendGroupSlugParamSchema),
  rotateCode: oc
    .route({ method: "POST", path: `${FG}/{slug}/code/rotate`, tags: [TAG] })
    .input(friendGroupSlugParamSchema)
    .output(friendGroupResponseSchema),
  disableCode: oc
    .route({ method: "DELETE", path: `${FG}/{slug}/code`, tags: [TAG] })
    .input(friendGroupSlugParamSchema)
    .output(friendGroupResponseSchema),
  enableCode: oc
    .route({ method: "POST", path: `${FG}/{slug}/code`, tags: [TAG] })
    .input(friendGroupSlugParamSchema)
    .output(friendGroupResponseSchema),
  inviteByEmail: oc
    .route({ method: "POST", path: `${FG}/{slug}/invites`, tags: [TAG], successStatus: 201 })
    .input(withParams(friendGroupSlugParamSchema, friendGroupInviteByEmailSchema)),
  acceptInvite: oc
    .route({
      method: "POST",
      path: `${FG}/{slug}/invites/{userId}/accept`,
      tags: [TAG],
      successStatus: 204,
    })
    .input(friendGroupSlugAndUserParamSchema),
  declineInvite: oc
    .route({
      method: "DELETE",
      path: `${FG}/{slug}/invites/{userId}`,
      tags: [TAG],
      successStatus: 204,
    })
    .input(friendGroupSlugAndUserParamSchema),
  leave: oc
    .route({ method: "POST", path: `${FG}/{slug}/leave`, tags: [TAG], successStatus: 204 })
    .input(friendGroupSlugParamSchema),
  transferOwnership: oc
    .route({
      method: "POST",
      path: `${FG}/{slug}/transfer-ownership`,
      tags: [TAG],
      successStatus: 204,
    })
    .input(withParams(friendGroupSlugParamSchema, friendGroupTransferOwnershipSchema)),
  updateRole: oc
    .route({ method: "PATCH", path: `${FG}/{slug}/members/{userId}/role`, tags: [TAG] })
    .input(withParams(friendGroupSlugAndUserParamSchema, friendGroupUpdateRoleSchema))
    .output(friendGroupMemberResponseSchema),
  setRevealedContacts: oc
    .route({ method: "PUT", path: `${FG}/{slug}/members/{userId}/contacts`, tags: [TAG] })
    .input(withParams(friendGroupSlugAndUserParamSchema, setRevealedContactsSchema))
    .output(friendGroupMemberResponseSchema),
  kickMember: oc
    .route({
      method: "DELETE",
      path: `${FG}/{slug}/members/{userId}`,
      tags: [TAG],
      successStatus: 204,
    })
    .input(friendGroupSlugAndUserParamSchema),
  shareableLists: oc
    .route({ method: "GET", path: `${FG}/{slug}/shareable-lists`, tags: [TAG] })
    .input(friendGroupSlugParamSchema)
    .output(friendGroupShareableListsResponseSchema),
  shareList: oc
    .route({ method: "POST", path: `${FG}/{slug}/lists`, tags: [TAG], successStatus: 204 })
    .input(withParams(friendGroupSlugParamSchema, friendGroupShareListSchema)),
  unshareList: oc
    .route({
      method: "DELETE",
      path: `${FG}/{slug}/lists/{listId}`,
      tags: [TAG],
      successStatus: 204,
    })
    .input(friendGroupSlugAndListIdParamSchema),
  shareableCollections: oc
    .route({ method: "GET", path: `${FG}/{slug}/shareable-collections`, tags: [TAG] })
    .input(friendGroupSlugParamSchema)
    .output(friendGroupShareableCollectionsResponseSchema),
  shareCollection: oc
    .route({ method: "POST", path: `${FG}/{slug}/collections`, tags: [TAG], successStatus: 204 })
    .input(withParams(friendGroupSlugParamSchema, friendGroupShareCollectionSchema)),
  unshareCollection: oc
    .route({
      method: "DELETE",
      path: `${FG}/{slug}/collections/{collectionId}`,
      tags: [TAG],
      successStatus: 204,
    })
    .input(friendGroupSlugAndCollectionIdParamSchema),
  getSharedCollection: oc
    .route({ method: "GET", path: `${FG}/{slug}/collections/{collectionId}`, tags: [TAG] })
    .input(friendGroupSlugAndCollectionIdParamSchema)
    .output(friendGroupSharedCollectionDetailResponseSchema),
  matches: oc
    .route({ method: "GET", path: `${FG}/{slug}/matches`, tags: [TAG] })
    .input(friendGroupSlugParamSchema)
    .output(friendGroupMatchesResponseSchema),
  getSharedList: oc
    .route({ method: "GET", path: `${FG}/{slug}/lists/{listId}`, tags: [TAG] })
    .input(friendGroupSlugAndListIdParamSchema)
    .output(friendGroupSharedListDetailResponseSchema),
  getMemberDetail: oc
    .route({ method: "GET", path: `${FG}/{slug}/members/{userId}`, tags: [TAG] })
    .input(friendGroupSlugAndUserParamSchema)
    .output(friendGroupMemberDetailResponseSchema),
  activity: oc
    .route({ method: "GET", path: `${FG}/{slug}/activity`, tags: [TAG] })
    .input(friendGroupSlugParamSchema)
    .output(friendGroupActivityResponseSchema),
};

export type FriendGroupsContract = typeof friendGroupsContract;
