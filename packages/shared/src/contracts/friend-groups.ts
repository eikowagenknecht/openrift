import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
  cardTypeSchema,
  contactMethodSchema,
  copyResponseSchema,
  currencyResponseSchema,
  finishSchema,
  imageIdSchema,
  listEntryDetailResponseSchema,
  raritySchema,
  tradePreferenceSchema,
  tradePricePrefResponseSchema,
  tradeTypeResponseSchema,
} from "@openrift/shared/response-schemas";
import {
  friendGroupSlugParamSchema,
  friendGroupSlugSchema,
  withParams,
} from "@openrift/shared/schemas";
import { oc } from "@orpc/contract";
import { z } from "zod";

extendZodWithOpenApi(z);

/**
 * Slugs that collide with app-level routes or obvious squat targets. Mirrored
 * in the route layer for a clean 400 before the DB rejects.
 */
export const RESERVED_FRIEND_GROUP_SLUGS = new Set(["new", "join", "create", "settings", "admin"]);

export const createFriendGroupSchema = z
  .object({
    slug: friendGroupSlugSchema,
    name: z.string().min(1).max(60),
    description: z.string().max(500).nullable().optional(),
    /** `true` (default) generates a join code; `false` creates an invite-only group. */
    generateCode: z.boolean().default(true),
  })
  .refine((data) => !RESERVED_FRIEND_GROUP_SLUGS.has(data.slug), {
    message: "Slug is reserved",
    path: ["slug"],
  });

export const updateFriendGroupSchema = z
  .object({
    slug: friendGroupSlugSchema.optional(),
    name: z.string().min(1).max(60).optional(),
    description: z.string().max(500).nullable().optional(),
  })
  .refine((data) => data.slug === undefined || !RESERVED_FRIEND_GROUP_SLUGS.has(data.slug), {
    message: "Slug is reserved",
    path: ["slug"],
  });

export const friendGroupCodeQuerySchema = z.object({
  code: z.string().min(8).max(64),
});

export const friendGroupJoinByCodeSchema = z.object({
  code: z.string().min(8).max(64),
});

export const friendGroupInviteByEmailSchema = z.object({
  email: z.email().max(320),
});

export const friendGroupUpdateRoleSchema = z.object({
  role: z.enum(["admin", "judge", "member"]),
});

/** Which of the viewer's contact methods are revealed to a given group. */
export const setRevealedContactsSchema = z.object({
  contactMethodIds: z.array(z.uuid()),
});

export const friendGroupTransferOwnershipSchema = z.object({
  userId: z.string().min(1),
});

export const friendGroupShareListSchema = z.object({
  listId: z.uuid(),
});

export const friendGroupShareCollectionSchema = z.object({
  collectionId: z.uuid(),
});

export const friendGroupSlugAndUserParamSchema = z.object({
  slug: friendGroupSlugSchema,
  userId: z.string().min(1),
});

export const friendGroupSlugAndListIdParamSchema = z.object({
  slug: friendGroupSlugSchema,
  listId: z.uuid(),
});

export const friendGroupSlugAndCollectionIdParamSchema = z.object({
  slug: friendGroupSlugSchema,
  collectionId: z.uuid(),
});

const effectiveTradePreferenceSchema = z
  .object({
    pricePref: tradePricePrefResponseSchema.nullable(),
    priceAbsoluteCents: z.number().int().positive().nullable(),
    tradeType: tradeTypeResponseSchema.nullable(),
    currency: currencyResponseSchema.nullable(),
  })
  .openapi("EffectiveTradePreference");

const friendGroupRoleSchema = z
  .enum(["owner", "admin", "judge", "member"])
  .openapi("FriendGroupRole");

export const friendGroupResponseSchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    /** Nullable when the group has disabled code-based joining. */
    code: z.string().nullable(),
    codeRotatedAt: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("FriendGroupResponse");

export const friendGroupSummaryResponseSchema = friendGroupResponseSchema
  .extend({
    viewerRole: friendGroupRoleSchema,
    memberCount: z.number().int().nonnegative(),
    pendingRequestCount: z.number().int().nonnegative(),
  })
  .openapi("FriendGroupSummaryResponse");

const friendGroupPendingInviteEntrySchema = z.object({
  id: z.string(),
  groupId: z.string(),
  groupSlug: z.string(),
  groupName: z.string(),
  createdAt: z.string(),
});

export const friendGroupListResponseSchema = z
  .object({
    items: z.array(friendGroupSummaryResponseSchema),
    pendingInvites: z.array(friendGroupPendingInviteEntrySchema),
    outgoingRequests: z.array(friendGroupPendingInviteEntrySchema),
  })
  .openapi("FriendGroupListResponse");

export const friendGroupMemberResponseSchema = z
  .object({
    userId: z.string(),
    userName: z.string().nullable(),
    userImage: z.string().nullable(),
    gravatarHash: z.string(),
    role: friendGroupRoleSchema,
    contactMethods: z.array(contactMethodSchema),
    joinedAt: z.string(),
  })
  .openapi("FriendGroupMemberResponse");

const friendGroupShareResponseSchema = z
  .object({
    groupId: z.string(),
    listId: z.string(),
    listName: z.string(),
    listIntent: z.enum(["wish", "trade", "organize"]),
    listKind: z.enum(["card", "printing", "copy"]),
    entryCount: z.number().int().nonnegative(),
    userId: z.string(),
    userName: z.string().nullable(),
    sharedAt: z.string(),
  })
  .openapi("FriendGroupShareResponse");

const friendGroupCollectionShareResponseSchema = z
  .object({
    groupId: z.string(),
    collectionId: z.string(),
    collectionName: z.string(),
    userId: z.string(),
    userName: z.string().nullable(),
    sharedAt: z.string(),
    copyCount: z.number().int().nonnegative(),
  })
  .openapi("FriendGroupCollectionShareResponse");

export const friendGroupRequestResponseSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    userName: z.string().nullable(),
    userImage: z.string().nullable(),
    gravatarHash: z.string(),
    createdAt: z.string(),
  })
  .openapi("FriendGroupRequestResponse");

const friendGroupViewerStatusSchema = z
  .enum(["member", "pending"])
  .openapi("FriendGroupViewerStatus");

export const friendGroupDetailResponseSchema = z
  .object({
    group: friendGroupResponseSchema,
    viewerStatus: friendGroupViewerStatusSchema,
    viewerRole: friendGroupRoleSchema.nullable(),
    members: z.array(friendGroupMemberResponseSchema),
    shares: z.array(friendGroupShareResponseSchema),
    collectionShares: z.array(friendGroupCollectionShareResponseSchema),
    pendingRequests: z.array(friendGroupRequestResponseSchema),
  })
  .openapi("FriendGroupDetailResponse");

export const friendGroupJoinPreviewResponseSchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    memberCount: z.number().int().nonnegative(),
    /**
     * `"member"` if the viewer is already in. `"pending"` if a request is
     * already queued. `"available"` otherwise.
     */
    viewerStatus: z.enum(["available", "pending", "member"]),
  })
  .openapi("FriendGroupJoinPreviewResponse");

export const friendGroupShareableListResponseSchema = z
  .object({
    listId: z.string(),
    listName: z.string(),
    listIntent: z.enum(["wish", "trade", "organize"]),
    listKind: z.enum(["card", "printing", "copy"]),
    entryCount: z.number().int().nonnegative(),
    sharedAt: z.string().nullable(),
    tradeDefaults: tradePreferenceSchema,
    currency: currencyResponseSchema.nullable(),
  })
  .openapi("FriendGroupShareableListResponse");

export const friendGroupShareableListsResponseSchema = z
  .object({ items: z.array(friendGroupShareableListResponseSchema) })
  .openapi("FriendGroupShareableListsResponse");

export const friendGroupShareableCollectionResponseSchema = z
  .object({
    collectionId: z.string(),
    collectionName: z.string(),
    sharedAt: z.string().nullable(),
  })
  .openapi("FriendGroupShareableCollectionResponse");

export const friendGroupShareableCollectionsResponseSchema = z
  .object({ items: z.array(friendGroupShareableCollectionResponseSchema) })
  .openapi("FriendGroupShareableCollectionsResponse");

const friendGroupMatchRowSchema = z
  .object({
    counterpartyUserId: z.string(),
    counterpartyName: z.string().nullable(),
    counterpartyImage: z.string().nullable(),
    counterpartyGravatarHash: z.string(),
    counterpartyListId: z.string(),
    counterpartyListName: z.string(),
    sellEntryId: z.string(),
    sellListId: z.string(),
    copyId: z.string(),
    printingId: z.string(),
    cardId: z.string(),
    cardName: z.string(),
    cardType: cardTypeSchema,
    setId: z.string(),
    rarity: raritySchema,
    finish: finishSchema,
    imageId: imageIdSchema.nullable(),
    buyEntryId: z.string(),
    buyListId: z.string(),
    buyEntryKind: z.enum(["card", "printing"]),
    buyQuantity: z.number().int().nonnegative(),
    sellPref: effectiveTradePreferenceSchema,
    buyPref: effectiveTradePreferenceSchema,
  })
  .openapi("FriendGroupMatchRow");

export const friendGroupMatchesResponseSchema = z
  .object({
    othersHaveYourWants: z.array(friendGroupMatchRowSchema),
    othersWantYourHaves: z.array(friendGroupMatchRowSchema),
  })
  .openapi("FriendGroupMatchesResponse");

export const friendGroupMemberDetailResponseSchema = z
  .object({
    member: friendGroupMemberResponseSchema,
    shares: z.array(friendGroupShareResponseSchema),
    collectionShares: z.array(friendGroupCollectionShareResponseSchema),
    matches: z.array(friendGroupMatchRowSchema),
    reverseMatches: z.array(friendGroupMatchRowSchema),
  })
  .openapi("FriendGroupMemberDetailResponse");

const friendGroupActivityEventSchema = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal("trade-completed"),
      at: z.string(),
      tradeId: z.string(),
      printingId: z.string(),
      cardId: z.string(),
      quantity: z.number().int().positive(),
      giverUserId: z.string(),
      giverName: z.string().nullable(),
      receiverUserId: z.string(),
      receiverName: z.string().nullable(),
    }),
    z.object({
      kind: z.literal("member-joined"),
      at: z.string(),
      userId: z.string(),
      userName: z.string().nullable(),
      userImage: z.string().nullable(),
      gravatarHash: z.string(),
    }),
    z.object({
      kind: z.literal("list-shared"),
      at: z.string(),
      userId: z.string(),
      userName: z.string().nullable(),
      listId: z.string(),
      listName: z.string(),
      listIntent: z.enum(["wish", "trade", "organize"]),
      listKind: z.enum(["card", "printing", "copy"]),
    }),
    z.object({
      kind: z.literal("collection-shared"),
      at: z.string(),
      userId: z.string(),
      userName: z.string().nullable(),
      collectionId: z.string(),
      collectionName: z.string(),
    }),
    z.object({
      kind: z.literal("match"),
      at: z.string(),
      counterpartyUserId: z.string(),
      counterpartyName: z.string().nullable(),
      counterpartyImage: z.string().nullable(),
      counterpartyGravatarHash: z.string(),
      printingId: z.string(),
      cardId: z.string(),
    }),
  ])
  .openapi("FriendGroupActivityEvent");

export const friendGroupActivityResponseSchema = z
  .object({ events: z.array(friendGroupActivityEventSchema) })
  .openapi("FriendGroupActivityResponse");

export const friendGroupPendingInvitesCountResponseSchema = z
  .object({ count: z.number().int().nonnegative() })
  .openapi("FriendGroupPendingInvitesCountResponse");

export const friendGroupPendingRequestsCountResponseSchema = z
  .object({ count: z.number().int().nonnegative() })
  .openapi("FriendGroupPendingRequestsCountResponse");

export const friendGroupSharedListDetailResponseSchema = z
  .object({
    list: z.object({
      id: z.string(),
      name: z.string(),
      intent: z.enum(["wish", "trade", "organize"]),
      kind: z.enum(["card", "printing", "copy"]),
      ownerUserId: z.string(),
      ownerName: z.string().nullable(),
      tradeDefaults: tradePreferenceSchema,
      currency: currencyResponseSchema.nullable(),
    }),
    entries: z.array(listEntryDetailResponseSchema),
  })
  .openapi("FriendGroupSharedListDetailResponse");

export const friendGroupSharedCollectionDetailResponseSchema = z
  .object({
    collection: z.object({
      id: z.string(),
      name: z.string(),
      description: z.string().nullable(),
      copyCount: z.number().int().nonnegative(),
      totalValueCents: z.number().int().nullable(),
      unpricedCopyCount: z.number().int().nullable(),
      ownerUserId: z.string(),
      ownerName: z.string().nullable(),
    }),
    copies: z.array(copyResponseSchema),
    viewerRole: friendGroupRoleSchema,
  })
  .openapi("FriendGroupSharedCollectionDetailResponse");

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
