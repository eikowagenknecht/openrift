import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
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
import { z } from "zod";

import { authedRoute } from "./_base.js";

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
  role: z.enum(["admin", "member"]),
});

/** Which of the viewer's contact methods are revealed to a given group. */
export const setRevealedContactsSchema = z.object({
  contactMethodIds: z.array(z.uuid()).max(500),
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

export const friendGroupSlugAndLinkIdParamSchema = z.object({
  slug: friendGroupSlugSchema,
  linkId: z.uuid(),
});

/** A Discord server linked to the group via the bot's /link command. */
export const friendGroupDiscordLinkResponseSchema = z
  .object({
    id: z.string(),
    guildId: z.string(),
    guildName: z.string().nullable(),
    linkedAt: z.string(),
  })
  .openapi("FriendGroupDiscordLinkResponse");

export const friendGroupDiscordLinksResponseSchema = z
  .object({
    items: z.array(friendGroupDiscordLinkResponseSchema),
  })
  .openapi("FriendGroupDiscordLinksResponse");

/** A one-time code to be redeemed with the bot's /link command in Discord. */
export const friendGroupDiscordLinkCodeResponseSchema = z
  .object({
    code: z.string(),
    expiresAt: z.string(),
  })
  .openapi("FriendGroupDiscordLinkCodeResponse");

export const effectiveTradePreferenceSchema = z
  .object({
    pricePref: tradePricePrefResponseSchema.nullable(),
    priceAbsoluteCents: z.number().int().positive().nullable(),
    tradeType: tradeTypeResponseSchema.nullable(),
    currency: currencyResponseSchema.nullable(),
  })
  .openapi("EffectiveTradePreference");

export const friendGroupRoleSchema = z
  .enum(["owner", "admin", "member"])
  .openapi("FriendGroupRole");

/**
 * Which way a pending membership row points: the group invited the user, or
 * the user asked to join. Owns the `friend_group_invites.direction` vocabulary.
 */
export const friendGroupInviteDirectionSchema = z.enum(["invite", "request"]);

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

/** A member teaser for avatar stacks — profile basics without the email. */
export const friendGroupMemberPreviewSchema = z
  .object({
    userId: z.string(),
    userName: z.string().nullable(),
    userImage: z.string().nullable(),
    gravatarHash: z.string(),
  })
  .openapi("FriendGroupMemberPreview");

export const friendGroupSummaryResponseSchema = friendGroupResponseSchema
  .extend({
    viewerRole: friendGroupRoleSchema,
    memberCount: z.number().int().nonnegative(),
    pendingRequestCount: z.number().int().nonnegative(),
    /** First few members (owner and admins first) for the tile avatar stack. */
    memberPreviews: z.array(friendGroupMemberPreviewSchema),
    sharedListCount: z.number().int().nonnegative(),
  })
  .openapi("FriendGroupSummaryResponse");

const friendGroupPendingInviteEntrySchema = z.object({
  id: z.string(),
  groupId: z.string(),
  groupSlug: z.string(),
  groupName: z.string(),
  createdAt: z.string(),
  memberCount: z.number().int().nonnegative(),
  memberPreviews: z.array(friendGroupMemberPreviewSchema),
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

export const friendGroupShareResponseSchema = z
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

/** One cover art slot for a shared collection's thumb stack / fan. */
export const friendGroupCollectionCoverSchema = z
  .object({
    printingId: z.string(),
    imageId: z.string(),
  })
  .openapi("FriendGroupCollectionCover");

export const friendGroupCollectionShareResponseSchema = z
  .object({
    groupId: z.string(),
    collectionId: z.string(),
    collectionName: z.string(),
    userId: z.string(),
    userName: z.string().nullable(),
    sharedAt: z.string(),
    copyCount: z.number().int().nonnegative(),
    /** Representative card art from the collection's contents, fan-ordered. */
    coverPrintings: z.array(friendGroupCollectionCoverSchema).default([]),
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
    /**
     * Lifetime cards traded in the group, by anyone with anyone: the summed
     * quantity over rows at least one party has settled. Group-wide, because
     * the hero stat it feeds is about the group.
     */
    cardsTradedCount: z.number().int().nonnegative().default(0),
    /**
     * Cards the *viewer* has traded with each other member of this group
     * (counterparty userId → summed quantity), over the rows whose swap is done
     * from the viewer's side — see `cardTradeState` in `@openrift/shared`.
     * Members the viewer has traded nothing with are absent.
     *
     * Viewer-scoped, unlike {@link cardsTradedCount}: it renders as a badge
     * beside a person on a page the viewer is reading, where a group-wide total
     * reads as a claim about the two of them and was wrong for every member the
     * viewer had never actually traded with.
     */
    cardsTradedByMember: z.record(z.string(), z.number().int().nonnegative()).default({}),
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
    hasRule: z.boolean(),
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

export const friendGroupMatchRowSchema = z
  .object({
    counterpartyUserId: z.string(),
    counterpartyName: z.string().nullable(),
    counterpartyImage: z.string().nullable(),
    counterpartyGravatarHash: z.string(),
    counterpartyListId: z.string(),
    counterpartyListName: z.string(),
    // The viewer's own list that produced this match: their wishlist for an
    // incoming row (they want the card), their tradelist for an outgoing one.
    viewerListName: z.string(),
    sellEntryId: z.string().nullable(),
    sellListId: z.string(),
    copyId: z.string(),
    // The offered copy's recorded condition (or grading) and public note, so
    // the counterparty sees what they'd get before requesting (ADR-038).
    condition: z.string().nullable(),
    grader: z.string().nullable(),
    grade: z.number().nullable(),
    notesPublic: z.string().nullable(),
    printingId: z.string(),
    cardId: z.string(),
    cardName: z.string(),
    setId: z.string(),
    rarity: raritySchema,
    finish: finishSchema,
    imageId: imageIdSchema.nullable(),
    buyEntryId: z.string().nullable(),
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
  })
  .openapi("FriendGroupMemberDetailResponse");

export const friendGroupActivityEventSchema = z
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
 * `/api/v1/friend-groups`). All require a session, so they share the
 * `authedRoute` base (UNAUTHORIZED + FORBIDDEN). Domain codes per route:
 * `create` → CONFLICT (slug taken); `preview`, `join`, `get`, `update`,
 * `remove`, `rotateCode`, `disableCode`, `enableCode`, `shareableLists`,
 * `shareableCollections`, `matches`, `activity` → NOT_FOUND (group); `join`
 * also adds CONFLICT (already a member); `update` also adds CONFLICT (slug
 * taken); `inviteByEmail` → NOT_FOUND + CONFLICT (member exists);
 * `acceptInvite`, `declineInvite` → NOT_FOUND (group or invite); `leave` →
 * NOT_FOUND + CONFLICT (owner must transfer first); `transferOwnership` →
 * NOT_FOUND + BAD_REQUEST (invalid target); `updateRole` → NOT_FOUND +
 * CONFLICT (cannot change owner's role); `setRevealedContacts`,
 * `getMemberDetail` → NOT_FOUND (member); `kickMember` → NOT_FOUND +
 * BAD_REQUEST (self-kick) + CONFLICT (cannot kick owner); `shareList`,
 * `unshareList`, `getSharedList` → NOT_FOUND (group or list);
 * `shareCollection`, `unshareCollection`, `getSharedCollection` → NOT_FOUND
 * (group or collection); `createDiscordLinkCode`, `listDiscordLinks` →
 * NOT_FOUND (group); `deleteDiscordLink` → NOT_FOUND (group or link). The
 * static single-segment paths (pending-*-count, preview, join) take
 * precedence over `{slug}`.
 *
 * `update` uses the detailed input structure because the path `slug`
 * (current) and the optional body `slug` (rename target) would otherwise
 * collide under the compact merge.
 */
export const friendGroupsContract = {
  list: authedRoute
    .route({ method: "GET", path: FG, tags: [TAG] })
    .output(friendGroupListResponseSchema),
  pendingInvitesCount: authedRoute
    .route({ method: "GET", path: `${FG}/pending-invites-count`, tags: [TAG] })
    .output(friendGroupPendingInvitesCountResponseSchema),
  pendingRequestsCount: authedRoute
    .route({ method: "GET", path: `${FG}/pending-requests-count`, tags: [TAG] })
    .output(friendGroupPendingRequestsCountResponseSchema),
  create: authedRoute
    .route({ method: "POST", path: FG, tags: [TAG], successStatus: 201 })
    .input(createFriendGroupSchema)
    .errors({ CONFLICT: { message: "Slug already in use" } })
    .output(friendGroupResponseSchema),
  preview: authedRoute
    .route({ method: "GET", path: `${FG}/preview`, tags: [TAG] })
    .input(friendGroupCodeQuerySchema)
    .errors({ NOT_FOUND: { message: "Group not found" } })
    .output(friendGroupJoinPreviewResponseSchema),
  join: authedRoute
    .route({ method: "POST", path: `${FG}/join`, tags: [TAG], successStatus: 202 })
    .errors({
      NOT_FOUND: { message: "Group not found" },
      CONFLICT: { message: "Already a member of that group" },
    })
    .input(friendGroupJoinByCodeSchema),
  get: authedRoute
    .route({ method: "GET", path: `${FG}/{slug}`, tags: [TAG] })
    .input(friendGroupSlugParamSchema)
    .errors({ NOT_FOUND: { message: "Group not found" } })
    .output(friendGroupDetailResponseSchema),
  update: authedRoute
    .route({ method: "PATCH", path: `${FG}/{slug}`, tags: [TAG], inputStructure: "detailed" })
    .input(z.object({ params: friendGroupSlugParamSchema, body: updateFriendGroupSchema }))
    .errors({
      NOT_FOUND: { message: "Group not found" },
      CONFLICT: { message: "Slug already in use" },
    })
    .output(friendGroupResponseSchema),
  remove: authedRoute
    .route({ method: "DELETE", path: `${FG}/{slug}`, tags: [TAG], successStatus: 204 })
    .errors({ NOT_FOUND: { message: "Group not found" } })
    .input(friendGroupSlugParamSchema),
  rotateCode: authedRoute
    .route({ method: "POST", path: `${FG}/{slug}/code/rotate`, tags: [TAG] })
    .input(friendGroupSlugParamSchema)
    .errors({ NOT_FOUND: { message: "Group not found" } })
    .output(friendGroupResponseSchema),
  disableCode: authedRoute
    .route({ method: "DELETE", path: `${FG}/{slug}/code`, tags: [TAG] })
    .input(friendGroupSlugParamSchema)
    .errors({ NOT_FOUND: { message: "Group not found" } })
    .output(friendGroupResponseSchema),
  enableCode: authedRoute
    .route({ method: "POST", path: `${FG}/{slug}/code`, tags: [TAG] })
    .input(friendGroupSlugParamSchema)
    .errors({ NOT_FOUND: { message: "Group not found" } })
    .output(friendGroupResponseSchema),
  inviteByEmail: authedRoute
    .route({ method: "POST", path: `${FG}/{slug}/invites`, tags: [TAG], successStatus: 201 })
    .errors({
      NOT_FOUND: { message: "User or group not found" },
      CONFLICT: { message: "User is already a member" },
    })
    .input(withParams(friendGroupSlugParamSchema, friendGroupInviteByEmailSchema)),
  acceptInvite: authedRoute
    .route({
      method: "POST",
      path: `${FG}/{slug}/invites/{userId}/accept`,
      tags: [TAG],
      successStatus: 204,
    })
    .errors({ NOT_FOUND: { message: "Group or invite not found" } })
    .input(friendGroupSlugAndUserParamSchema),
  declineInvite: authedRoute
    .route({
      method: "DELETE",
      path: `${FG}/{slug}/invites/{userId}`,
      tags: [TAG],
      successStatus: 204,
    })
    .errors({ NOT_FOUND: { message: "Group or invite not found" } })
    .input(friendGroupSlugAndUserParamSchema),
  leave: authedRoute
    .route({ method: "POST", path: `${FG}/{slug}/leave`, tags: [TAG], successStatus: 204 })
    .errors({
      NOT_FOUND: { message: "Group not found" },
      CONFLICT: { message: "Transfer ownership before leaving" },
    })
    .input(friendGroupSlugParamSchema),
  transferOwnership: authedRoute
    .route({
      method: "POST",
      path: `${FG}/{slug}/transfer-ownership`,
      tags: [TAG],
      successStatus: 204,
    })
    .errors({
      NOT_FOUND: { message: "Group not found" },
      BAD_REQUEST: { message: "Invalid transfer target" },
    })
    .input(withParams(friendGroupSlugParamSchema, friendGroupTransferOwnershipSchema)),
  updateRole: authedRoute
    .route({ method: "PATCH", path: `${FG}/{slug}/members/{userId}/role`, tags: [TAG] })
    .input(withParams(friendGroupSlugAndUserParamSchema, friendGroupUpdateRoleSchema))
    .errors({
      NOT_FOUND: { message: "Member not found" },
      CONFLICT: { message: "Cannot change that member's role" },
    })
    .output(friendGroupMemberResponseSchema),
  setRevealedContacts: authedRoute
    .route({ method: "PUT", path: `${FG}/{slug}/members/{userId}/contacts`, tags: [TAG] })
    .input(withParams(friendGroupSlugAndUserParamSchema, setRevealedContactsSchema))
    .errors({ NOT_FOUND: { message: "Member not found" } })
    .output(friendGroupMemberResponseSchema),
  kickMember: authedRoute
    .route({
      method: "DELETE",
      path: `${FG}/{slug}/members/{userId}`,
      tags: [TAG],
      successStatus: 204,
    })
    .errors({
      NOT_FOUND: { message: "Member not found" },
      BAD_REQUEST: { message: "Cannot kick yourself" },
      CONFLICT: { message: "Cannot kick the owner" },
    })
    .input(friendGroupSlugAndUserParamSchema),
  shareableLists: authedRoute
    .route({ method: "GET", path: `${FG}/{slug}/shareable-lists`, tags: [TAG] })
    .input(friendGroupSlugParamSchema)
    .errors({ NOT_FOUND: { message: "Group not found" } })
    .output(friendGroupShareableListsResponseSchema),
  shareList: authedRoute
    .route({ method: "POST", path: `${FG}/{slug}/lists`, tags: [TAG], successStatus: 204 })
    .errors({ NOT_FOUND: { message: "Group or list not found" } })
    .input(withParams(friendGroupSlugParamSchema, friendGroupShareListSchema)),
  unshareList: authedRoute
    .route({
      method: "DELETE",
      path: `${FG}/{slug}/lists/{listId}`,
      tags: [TAG],
      successStatus: 204,
    })
    .errors({ NOT_FOUND: { message: "Group or list not found" } })
    .input(friendGroupSlugAndListIdParamSchema),
  shareableCollections: authedRoute
    .route({ method: "GET", path: `${FG}/{slug}/shareable-collections`, tags: [TAG] })
    .input(friendGroupSlugParamSchema)
    .errors({ NOT_FOUND: { message: "Group not found" } })
    .output(friendGroupShareableCollectionsResponseSchema),
  shareCollection: authedRoute
    .route({ method: "POST", path: `${FG}/{slug}/collections`, tags: [TAG], successStatus: 204 })
    .errors({ NOT_FOUND: { message: "Group or collection not found" } })
    .input(withParams(friendGroupSlugParamSchema, friendGroupShareCollectionSchema)),
  unshareCollection: authedRoute
    .route({
      method: "DELETE",
      path: `${FG}/{slug}/collections/{collectionId}`,
      tags: [TAG],
      successStatus: 204,
    })
    .errors({ NOT_FOUND: { message: "Group or collection not found" } })
    .input(friendGroupSlugAndCollectionIdParamSchema),
  getSharedCollection: authedRoute
    .route({ method: "GET", path: `${FG}/{slug}/collections/{collectionId}`, tags: [TAG] })
    .input(friendGroupSlugAndCollectionIdParamSchema)
    .errors({ NOT_FOUND: { message: "Group or collection not found" } })
    .output(friendGroupSharedCollectionDetailResponseSchema),
  matches: authedRoute
    .route({ method: "GET", path: `${FG}/{slug}/matches`, tags: [TAG] })
    .input(friendGroupSlugParamSchema)
    .errors({ NOT_FOUND: { message: "Group not found" } })
    .output(friendGroupMatchesResponseSchema),
  getSharedList: authedRoute
    .route({ method: "GET", path: `${FG}/{slug}/lists/{listId}`, tags: [TAG] })
    .input(friendGroupSlugAndListIdParamSchema)
    .errors({ NOT_FOUND: { message: "Group or list not found" } })
    .output(friendGroupSharedListDetailResponseSchema),
  getMemberDetail: authedRoute
    .route({ method: "GET", path: `${FG}/{slug}/members/{userId}`, tags: [TAG] })
    .input(friendGroupSlugAndUserParamSchema)
    .errors({ NOT_FOUND: { message: "Member not found" } })
    .output(friendGroupMemberDetailResponseSchema),
  activity: authedRoute
    .route({ method: "GET", path: `${FG}/{slug}/activity`, tags: [TAG] })
    .input(friendGroupSlugParamSchema)
    .errors({ NOT_FOUND: { message: "Group not found" } })
    .output(friendGroupActivityResponseSchema),
  // Discord linking (admin+): generating a code and unlinking are the group's
  // consent surface for the bot's group-scoped replies in that server.
  createDiscordLinkCode: authedRoute
    .route({ method: "POST", path: `${FG}/{slug}/discord-links/code`, tags: [TAG] })
    .input(friendGroupSlugParamSchema)
    .errors({ NOT_FOUND: { message: "Group not found" } })
    .output(friendGroupDiscordLinkCodeResponseSchema),
  listDiscordLinks: authedRoute
    .route({ method: "GET", path: `${FG}/{slug}/discord-links`, tags: [TAG] })
    .input(friendGroupSlugParamSchema)
    .errors({ NOT_FOUND: { message: "Group not found" } })
    .output(friendGroupDiscordLinksResponseSchema),
  deleteDiscordLink: authedRoute
    .route({
      method: "DELETE",
      path: `${FG}/{slug}/discord-links/{linkId}`,
      tags: [TAG],
      successStatus: 204,
    })
    .errors({ NOT_FOUND: { message: "Group or link not found" } })
    .input(friendGroupSlugAndLinkIdParamSchema),
};

export type FriendGroupsContract = typeof friendGroupsContract;
