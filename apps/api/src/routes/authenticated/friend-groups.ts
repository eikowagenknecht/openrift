import { createRoute } from "@hono/zod-openapi";
import { ERROR_CODES } from "@openrift/shared";
import type {
  FriendGroupCollectionShareResponse,
  FriendGroupDetailResponse,
  FriendGroupJoinPreviewResponse,
  FriendGroupListResponse,
  FriendGroupMatchesResponse,
  FriendGroupMemberDetailResponse,
  FriendGroupMemberResponse,
  FriendGroupPendingInvitesCountResponse,
  FriendGroupRequestResponse,
  FriendGroupResponse,
  FriendGroupRole,
  FriendGroupShareResponse,
  FriendGroupShareableCollectionsResponse,
  FriendGroupShareableListsResponse,
  FriendGroupSharedCollectionDetailResponse,
  FriendGroupSharedListDetailResponse,
  FriendGroupSummaryResponse,
  ListIntent,
  ListKind,
} from "@openrift/shared";
import {
  friendGroupDetailResponseSchema,
  friendGroupJoinPreviewResponseSchema,
  friendGroupListResponseSchema,
  friendGroupMatchesResponseSchema,
  friendGroupMemberDetailResponseSchema,
  friendGroupMemberResponseSchema,
  friendGroupPendingInvitesCountResponseSchema,
  friendGroupResponseSchema,
  friendGroupShareableCollectionsResponseSchema,
  friendGroupShareableListsResponseSchema,
  friendGroupSharedCollectionDetailResponseSchema,
  friendGroupSharedListDetailResponseSchema,
} from "@openrift/shared/response-schemas";
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
  friendGroupUpdateNicknameSchema,
  friendGroupUpdateRoleSchema,
  updateFriendGroupSchema,
} from "@openrift/shared/schemas";

import type { Repos } from "../../deps.js";
import { AppError } from "../../errors.js";
import { gravatarHashForEmail } from "../../lib/gravatar.js";
import { getUserId } from "../../middleware/get-user-id.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { createApiApp } from "../../openapi.js";
import type { Group, GroupMember, MemberWithUser } from "../../repositories/friend-groups.js";
import { toListEntryDetail } from "../../utils/mappers.js";
import { getFavoriteMarketplace } from "../../utils/preferences.js";
import { generateShareToken } from "../../utils/share-token.js";

// ─── Authz helpers ──────────────────────────────────────────────────────────

interface GroupContext {
  group: Group;
  membership: GroupMember;
}

/**
 * Loads the group by slug + the viewer's membership; 404 if either missing.
 * @returns The matched group and the viewer's membership row.
 */
async function loadGroupForMember(
  repos: Repos,
  slug: string,
  viewerId: string,
): Promise<GroupContext> {
  const group = await repos.friendGroups.getBySlug(slug);
  if (!group) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Group not found");
  }
  const membership = await repos.friendGroups.getMembership(group.id, viewerId);
  if (!membership) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Group not found");
  }
  return { group, membership };
}

function requireRole(membership: GroupMember, minimum: "admin" | "owner"): void {
  if (minimum === "owner" && membership.role !== "owner") {
    throw new AppError(403, ERROR_CODES.FORBIDDEN, "Owner only");
  }
  if (minimum === "admin" && membership.role !== "admin" && membership.role !== "owner") {
    throw new AppError(403, ERROR_CODES.FORBIDDEN, "Admin only");
  }
}

// ─── Mappers ────────────────────────────────────────────────────────────────

function toGroup(row: Group, includeCode: boolean): FriendGroupResponse {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    code: includeCode ? row.code : null,
    codeRotatedAt: row.codeRotatedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toMember(row: MemberWithUser): FriendGroupMemberResponse {
  return {
    userId: row.userId,
    userName: row.userName,
    userImage: row.userImage,
    gravatarHash: gravatarHashForEmail(row.userEmail),
    role: row.role,
    nickname: row.nickname,
    joinedAt: row.joinedAt.toISOString(),
  };
}

interface ShareRow {
  groupId: string;
  listId: string;
  userId: string;
  sharedAt: Date;
  listName: string;
  listIntent: string;
  listKind: string;
  entryCount: number;
  userName: string | null;
}

function toShare(row: ShareRow): FriendGroupShareResponse {
  return {
    groupId: row.groupId,
    listId: row.listId,
    listName: row.listName,
    listIntent: row.listIntent as FriendGroupShareResponse["listIntent"],
    listKind: row.listKind as FriendGroupShareResponse["listKind"],
    entryCount: row.entryCount,
    userId: row.userId,
    userName: row.userName,
    sharedAt: row.sharedAt.toISOString(),
  };
}

interface CollectionShareRow {
  groupId: string;
  collectionId: string;
  userId: string;
  sharedAt: Date;
  collectionName: string;
  userName: string | null;
}

function toCollectionShare(row: CollectionShareRow): FriendGroupCollectionShareResponse {
  return {
    groupId: row.groupId,
    collectionId: row.collectionId,
    collectionName: row.collectionName,
    userId: row.userId,
    userName: row.userName,
    sharedAt: row.sharedAt.toISOString(),
  };
}

interface PendingRequestRow {
  id: string;
  userId: string;
  createdAt: Date;
  userName: string | null;
  userEmail: string;
  userImage: string | null;
}

function toRequest(row: PendingRequestRow): FriendGroupRequestResponse {
  return {
    id: row.id,
    userId: row.userId,
    userName: row.userName,
    userImage: row.userImage,
    gravatarHash: gravatarHashForEmail(row.userEmail),
    createdAt: row.createdAt.toISOString(),
  };
}

// ─── Route definitions (OpenAPI) ────────────────────────────────────────────

const listGroups = createRoute({
  method: "get",
  path: "/friend-groups",
  tags: ["FriendGroups"],
  responses: {
    200: {
      content: { "application/json": { schema: friendGroupListResponseSchema } },
      description: "Success",
    },
  },
});

const pendingInvitesCount = createRoute({
  method: "get",
  path: "/friend-groups/pending-invites-count",
  tags: ["FriendGroups"],
  responses: {
    200: {
      content: { "application/json": { schema: friendGroupPendingInvitesCountResponseSchema } },
      description: "Success",
    },
  },
});

const createGroup = createRoute({
  method: "post",
  path: "/friend-groups",
  tags: ["FriendGroups"],
  request: {
    body: {
      content: { "application/json": { schema: createFriendGroupSchema } },
      required: true,
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: friendGroupResponseSchema } },
      description: "Created",
    },
  },
});

const previewByCode = createRoute({
  method: "get",
  path: "/friend-groups/preview",
  tags: ["FriendGroups"],
  request: { query: friendGroupCodeQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: friendGroupJoinPreviewResponseSchema } },
      description: "Success",
    },
  },
});

const joinByCode = createRoute({
  method: "post",
  path: "/friend-groups/join",
  tags: ["FriendGroups"],
  request: {
    body: {
      content: { "application/json": { schema: friendGroupJoinByCodeSchema } },
      required: true,
    },
  },
  responses: {
    202: { description: "Request submitted, awaiting admin approval" },
  },
});

const getGroup = createRoute({
  method: "get",
  path: "/friend-groups/{slug}",
  tags: ["FriendGroups"],
  request: { params: friendGroupSlugParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: friendGroupDetailResponseSchema } },
      description: "Success",
    },
  },
});

const updateGroup = createRoute({
  method: "patch",
  path: "/friend-groups/{slug}",
  tags: ["FriendGroups"],
  request: {
    params: friendGroupSlugParamSchema,
    body: { content: { "application/json": { schema: updateFriendGroupSchema } }, required: true },
  },
  responses: {
    200: {
      content: { "application/json": { schema: friendGroupResponseSchema } },
      description: "Success",
    },
  },
});

const deleteGroup = createRoute({
  method: "delete",
  path: "/friend-groups/{slug}",
  tags: ["FriendGroups"],
  request: { params: friendGroupSlugParamSchema },
  responses: { 204: { description: "No Content" } },
});

const rotateCode = createRoute({
  method: "post",
  path: "/friend-groups/{slug}/code/rotate",
  tags: ["FriendGroups"],
  request: { params: friendGroupSlugParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: friendGroupResponseSchema } },
      description: "Success",
    },
  },
});

const disableCode = createRoute({
  method: "delete",
  path: "/friend-groups/{slug}/code",
  tags: ["FriendGroups"],
  request: { params: friendGroupSlugParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: friendGroupResponseSchema } },
      description: "Success",
    },
  },
});

const enableCode = createRoute({
  method: "post",
  path: "/friend-groups/{slug}/code",
  tags: ["FriendGroups"],
  request: { params: friendGroupSlugParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: friendGroupResponseSchema } },
      description: "Success",
    },
  },
});

const inviteByEmail = createRoute({
  method: "post",
  path: "/friend-groups/{slug}/invites",
  tags: ["FriendGroups"],
  request: {
    params: friendGroupSlugParamSchema,
    body: {
      content: { "application/json": { schema: friendGroupInviteByEmailSchema } },
      required: true,
    },
  },
  responses: { 202: { description: "Invite created" } },
});

const acceptInvite = createRoute({
  method: "post",
  path: "/friend-groups/{slug}/invites/{userId}/accept",
  tags: ["FriendGroups"],
  request: { params: friendGroupSlugAndUserParamSchema },
  responses: { 204: { description: "Invite accepted / request approved" } },
});

const declineInvite = createRoute({
  method: "delete",
  path: "/friend-groups/{slug}/invites/{userId}",
  tags: ["FriendGroups"],
  request: { params: friendGroupSlugAndUserParamSchema },
  responses: { 204: { description: "No Content" } },
});

const leaveGroup = createRoute({
  method: "post",
  path: "/friend-groups/{slug}/leave",
  tags: ["FriendGroups"],
  request: { params: friendGroupSlugParamSchema },
  responses: { 204: { description: "No Content" } },
});

const transferOwnership = createRoute({
  method: "post",
  path: "/friend-groups/{slug}/transfer-ownership",
  tags: ["FriendGroups"],
  request: {
    params: friendGroupSlugParamSchema,
    body: {
      content: { "application/json": { schema: friendGroupTransferOwnershipSchema } },
      required: true,
    },
  },
  responses: { 204: { description: "No Content" } },
});

const updateRole = createRoute({
  method: "patch",
  path: "/friend-groups/{slug}/members/{userId}/role",
  tags: ["FriendGroups"],
  request: {
    params: friendGroupSlugAndUserParamSchema,
    body: {
      content: { "application/json": { schema: friendGroupUpdateRoleSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: friendGroupMemberResponseSchema } },
      description: "Success",
    },
  },
});

const updateNickname = createRoute({
  method: "patch",
  path: "/friend-groups/{slug}/members/{userId}/nickname",
  tags: ["FriendGroups"],
  request: {
    params: friendGroupSlugAndUserParamSchema,
    body: {
      content: { "application/json": { schema: friendGroupUpdateNicknameSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: friendGroupMemberResponseSchema } },
      description: "Success",
    },
  },
});

const kickMember = createRoute({
  method: "delete",
  path: "/friend-groups/{slug}/members/{userId}",
  tags: ["FriendGroups"],
  request: { params: friendGroupSlugAndUserParamSchema },
  responses: { 204: { description: "No Content" } },
});

const shareableLists = createRoute({
  method: "get",
  path: "/friend-groups/{slug}/shareable-lists",
  tags: ["FriendGroups"],
  request: { params: friendGroupSlugParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: friendGroupShareableListsResponseSchema } },
      description: "Success",
    },
  },
});

const shareList = createRoute({
  method: "post",
  path: "/friend-groups/{slug}/lists",
  tags: ["FriendGroups"],
  request: {
    params: friendGroupSlugParamSchema,
    body: {
      content: { "application/json": { schema: friendGroupShareListSchema } },
      required: true,
    },
  },
  responses: { 204: { description: "No Content" } },
});

const unshareList = createRoute({
  method: "delete",
  path: "/friend-groups/{slug}/lists/{listId}",
  tags: ["FriendGroups"],
  request: { params: friendGroupSlugAndListIdParamSchema },
  responses: { 204: { description: "No Content" } },
});

const shareableCollections = createRoute({
  method: "get",
  path: "/friend-groups/{slug}/shareable-collections",
  tags: ["FriendGroups"],
  request: { params: friendGroupSlugParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: friendGroupShareableCollectionsResponseSchema } },
      description: "Success",
    },
  },
});

const shareCollection = createRoute({
  method: "post",
  path: "/friend-groups/{slug}/collections",
  tags: ["FriendGroups"],
  request: {
    params: friendGroupSlugParamSchema,
    body: {
      content: { "application/json": { schema: friendGroupShareCollectionSchema } },
      required: true,
    },
  },
  responses: { 204: { description: "No Content" } },
});

const unshareCollection = createRoute({
  method: "delete",
  path: "/friend-groups/{slug}/collections/{collectionId}",
  tags: ["FriendGroups"],
  request: { params: friendGroupSlugAndCollectionIdParamSchema },
  responses: { 204: { description: "No Content" } },
});

const getSharedCollection = createRoute({
  method: "get",
  path: "/friend-groups/{slug}/collections/{collectionId}",
  tags: ["FriendGroups"],
  request: { params: friendGroupSlugAndCollectionIdParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: friendGroupSharedCollectionDetailResponseSchema } },
      description: "Success",
    },
  },
});

const getMatches = createRoute({
  method: "get",
  path: "/friend-groups/{slug}/matches",
  tags: ["FriendGroups"],
  request: { params: friendGroupSlugParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: friendGroupMatchesResponseSchema } },
      description: "Success",
    },
  },
});

const getSharedList = createRoute({
  method: "get",
  path: "/friend-groups/{slug}/lists/{listId}",
  tags: ["FriendGroups"],
  request: { params: friendGroupSlugAndListIdParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: friendGroupSharedListDetailResponseSchema } },
      description: "Success",
    },
  },
});

const getMemberDetail = createRoute({
  method: "get",
  path: "/friend-groups/{slug}/members/{userId}",
  tags: ["FriendGroups"],
  request: { params: friendGroupSlugAndUserParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: friendGroupMemberDetailResponseSchema } },
      description: "Success",
    },
  },
});

// ─── App ────────────────────────────────────────────────────────────────────

const friendGroupsApp = createApiApp();
friendGroupsApp.use("/friend-groups/*", requireAuth);

function canSeeCode(role: FriendGroupRole): boolean {
  return role === "owner" || role === "admin";
}

export const friendGroupsRoute = friendGroupsApp
  // ── LIST ────────────────────────────────────────────────────────────────
  .openapi(listGroups, async (c) => {
    const userId = getUserId(c);
    const { friendGroups } = c.get("repos");
    const [groups, invites] = await Promise.all([
      friendGroups.listGroupsForUser(userId),
      friendGroups.listInvitesForUser(userId),
    ]);
    const response: FriendGroupListResponse = {
      items: groups.map(
        (row): FriendGroupSummaryResponse => ({
          ...toGroup(row, canSeeCode(row.viewerRole)),
          viewerRole: row.viewerRole,
          memberCount: row.memberCount,
          pendingRequestCount: row.pendingRequestCount,
        }),
      ),
      pendingInvites: invites.map((row) => ({
        id: row.id,
        groupId: row.groupId,
        groupSlug: row.groupSlug,
        groupName: row.groupName,
        createdAt: row.createdAt.toISOString(),
      })),
    };
    return c.json(response);
  })

  // ── BADGE COUNT ─────────────────────────────────────────────────────────
  .openapi(pendingInvitesCount, async (c) => {
    const userId = getUserId(c);
    const { friendGroups } = c.get("repos");
    const count = await friendGroups.pendingInvitesCountForUser(userId);
    return c.json({ count } satisfies FriendGroupPendingInvitesCountResponse);
  })

  // ── CREATE ──────────────────────────────────────────────────────────────
  .openapi(createGroup, async (c) => {
    const userId = getUserId(c);
    const { friendGroups } = c.get("repos");
    const body = c.req.valid("json");

    if (await friendGroups.getBySlug(body.slug)) {
      throw new AppError(409, ERROR_CODES.CONFLICT, "Slug already in use");
    }

    const group = await friendGroups.createWithOwner(
      {
        slug: body.slug,
        name: body.name,
        description: body.description ?? null,
        code: body.generateCode ? generateShareToken() : null,
      },
      userId,
    );
    return c.json(toGroup(group, true), 201);
  })

  // ── JOIN PREVIEW ────────────────────────────────────────────────────────
  .openapi(previewByCode, async (c) => {
    const viewerId = getUserId(c);
    const { friendGroups } = c.get("repos");
    const { code } = c.req.valid("query");

    const group = await friendGroups.getByCode(code);
    if (!group) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "No group matches that code");
    }

    const [members, existingMembership, existingInvite] = await Promise.all([
      friendGroups.listMembers(group.id),
      friendGroups.getMembership(group.id, viewerId),
      friendGroups.getInvite(group.id, viewerId),
    ]);

    const owner = members.find((member) => member.role === "owner");
    const viewerStatus = existingMembership ? "member" : existingInvite ? "pending" : "available";

    const response: FriendGroupJoinPreviewResponse = {
      id: group.id,
      slug: group.slug,
      name: group.name,
      description: group.description,
      memberCount: members.length,
      ownerName: owner?.userName ?? null,
      viewerStatus,
    };
    return c.json(response);
  })

  // ── JOIN (submits a request) ────────────────────────────────────────────
  .openapi(joinByCode, async (c) => {
    const viewerId = getUserId(c);
    const { friendGroups } = c.get("repos");
    const { code } = c.req.valid("json");

    const group = await friendGroups.getByCode(code);
    if (!group) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "No group matches that code");
    }

    const existingMembership = await friendGroups.getMembership(group.id, viewerId);
    if (existingMembership) {
      throw new AppError(409, ERROR_CODES.CONFLICT, "You are already a member of that group");
    }

    await friendGroups.createInvite(group.id, viewerId, "request");
    return c.body(null, 202);
  })

  // ── DETAIL ──────────────────────────────────────────────────────────────
  .openapi(getGroup, async (c) => {
    const viewerId = getUserId(c);
    const { friendGroups } = c.get("repos");
    const { slug } = c.req.valid("param");

    const group = await friendGroups.getBySlug(slug);
    if (!group) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Group not found");
    }

    const [membership, invite] = await Promise.all([
      friendGroups.getMembership(group.id, viewerId),
      friendGroups.getInvite(group.id, viewerId),
    ]);

    if (!membership && invite?.direction === "request") {
      const response: FriendGroupDetailResponse = {
        group: toGroup(group, false),
        viewerStatus: "pending",
        viewerRole: null,
        members: [],
        shares: [],
        collectionShares: [],
        pendingRequests: [],
      };
      return c.json(response);
    }

    if (!membership) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Group not found");
    }

    const isAdmin = membership.role === "owner" || membership.role === "admin";
    const [members, shares, collectionShares, pendingRequests] = await Promise.all([
      friendGroups.listMembers(group.id),
      friendGroups.listSharesForGroup(group.id),
      friendGroups.collectionSharesForGroup(group.id),
      isAdmin ? friendGroups.listRequestsForGroup(group.id) : Promise.resolve([]),
    ]);

    const response: FriendGroupDetailResponse = {
      group: toGroup(group, canSeeCode(membership.role)),
      viewerStatus: "member",
      viewerRole: membership.role,
      members: members.map((row) => toMember(row)),
      shares: shares.map((row) => toShare(row)),
      collectionShares: collectionShares.map((row) => toCollectionShare(row)),
      pendingRequests: pendingRequests.map((row) => toRequest(row)),
    };
    return c.json(response);
  })

  // ── UPDATE METADATA (admin+) ────────────────────────────────────────────
  .openapi(updateGroup, async (c) => {
    const viewerId = getUserId(c);
    const { friendGroups } = c.get("repos");
    const { slug } = c.req.valid("param");
    const body = c.req.valid("json");

    const ctx = await loadGroupForMember(c.get("repos"), slug, viewerId);
    requireRole(ctx.membership, "admin");

    if (body.slug && body.slug !== ctx.group.slug) {
      const existing = await friendGroups.getBySlug(body.slug);
      if (existing) {
        throw new AppError(409, ERROR_CODES.CONFLICT, "Slug already in use");
      }
    }

    const patched = await friendGroups.update(ctx.group.id, {
      slug: body.slug,
      name: body.name,
      description: body.description ?? undefined,
      updatedAt: new Date(),
    });
    if (!patched) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Group not found");
    }
    return c.json(toGroup(patched, true));
  })

  // ── DELETE (owner only) ─────────────────────────────────────────────────
  .openapi(deleteGroup, async (c) => {
    const viewerId = getUserId(c);
    const { friendGroups } = c.get("repos");
    const { slug } = c.req.valid("param");

    const ctx = await loadGroupForMember(c.get("repos"), slug, viewerId);
    requireRole(ctx.membership, "owner");

    await friendGroups.deleteById(ctx.group.id);
    return c.body(null, 204);
  })

  // ── ROTATE CODE (admin+) ────────────────────────────────────────────────
  .openapi(rotateCode, async (c) => {
    const viewerId = getUserId(c);
    const { friendGroups } = c.get("repos");
    const { slug } = c.req.valid("param");

    const ctx = await loadGroupForMember(c.get("repos"), slug, viewerId);
    requireRole(ctx.membership, "admin");

    const updated = await friendGroups.setCode(ctx.group.id, generateShareToken());
    if (!updated) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Group not found");
    }
    return c.json(toGroup(updated, true));
  })

  // ── DISABLE CODE (admin+) ───────────────────────────────────────────────
  .openapi(disableCode, async (c) => {
    const viewerId = getUserId(c);
    const { friendGroups } = c.get("repos");
    const { slug } = c.req.valid("param");

    const ctx = await loadGroupForMember(c.get("repos"), slug, viewerId);
    requireRole(ctx.membership, "admin");

    const updated = await friendGroups.setCode(ctx.group.id, null);
    if (!updated) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Group not found");
    }
    return c.json(toGroup(updated, true));
  })

  // ── RE-ENABLE CODE (admin+) ─────────────────────────────────────────────
  .openapi(enableCode, async (c) => {
    const viewerId = getUserId(c);
    const { friendGroups } = c.get("repos");
    const { slug } = c.req.valid("param");

    const ctx = await loadGroupForMember(c.get("repos"), slug, viewerId);
    requireRole(ctx.membership, "admin");

    const updated = await friendGroups.setCode(ctx.group.id, generateShareToken());
    if (!updated) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Group not found");
    }
    return c.json(toGroup(updated, true));
  })

  // ── INVITE BY EMAIL (admin+) ────────────────────────────────────────────
  .openapi(inviteByEmail, async (c) => {
    const viewerId = getUserId(c);
    const { friendGroups, users } = c.get("repos");
    const { slug } = c.req.valid("param");
    const { email } = c.req.valid("json");

    const ctx = await loadGroupForMember(c.get("repos"), slug, viewerId);
    requireRole(ctx.membership, "admin");

    const target = await users.getByEmail(email);
    if (!target) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "No user with that email");
    }

    const existingMembership = await friendGroups.getMembership(ctx.group.id, target.id);
    if (existingMembership) {
      throw new AppError(409, ERROR_CODES.CONFLICT, "User is already a member");
    }

    await friendGroups.createInvite(ctx.group.id, target.id, "invite");
    return c.body(null, 202);
  })

  // ── ACCEPT (invite or request) ──────────────────────────────────────────
  .openapi(acceptInvite, async (c) => {
    const viewerId = getUserId(c);
    const { friendGroups } = c.get("repos");
    const { slug, userId: targetUserId } = c.req.valid("param");

    const group = await friendGroups.getBySlug(slug);
    if (!group) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Group not found");
    }

    const invite = await friendGroups.getInvite(group.id, targetUserId);
    if (!invite) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "No pending invite");
    }

    if (invite.direction === "invite") {
      if (targetUserId !== viewerId) {
        throw new AppError(403, ERROR_CODES.FORBIDDEN, "Only the invitee can accept");
      }
    } else {
      const membership = await friendGroups.getMembership(group.id, viewerId);
      if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
        throw new AppError(403, ERROR_CODES.FORBIDDEN, "Admin only");
      }
    }

    // Add the member and consume the invite atomically so a failure can't
    // leave a member without clearing the pending invite (or vice versa).
    await c.get("transact")(async (repos) => {
      await repos.friendGroups.addMember(group.id, targetUserId, "member");
      await repos.friendGroups.deleteInvite(group.id, targetUserId);
    });
    return c.body(null, 204);
  })

  // ── DECLINE (invite or request) ─────────────────────────────────────────
  .openapi(declineInvite, async (c) => {
    const viewerId = getUserId(c);
    const { friendGroups } = c.get("repos");
    const { slug, userId: targetUserId } = c.req.valid("param");

    const group = await friendGroups.getBySlug(slug);
    if (!group) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Group not found");
    }

    const invite = await friendGroups.getInvite(group.id, targetUserId);
    if (!invite) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "No pending invite");
    }

    // Allow self-decline (invitee declining / requester cancelling) OR admin/owner.
    if (targetUserId !== viewerId) {
      const membership = await friendGroups.getMembership(group.id, viewerId);
      if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
        throw new AppError(403, ERROR_CODES.FORBIDDEN, "Forbidden");
      }
    }

    await friendGroups.deleteInvite(group.id, targetUserId);
    return c.body(null, 204);
  })

  // ── LEAVE ───────────────────────────────────────────────────────────────
  .openapi(leaveGroup, async (c) => {
    const viewerId = getUserId(c);
    const { friendGroups } = c.get("repos");
    const { slug } = c.req.valid("param");

    const ctx = await loadGroupForMember(c.get("repos"), slug, viewerId);
    if (ctx.membership.role === "owner") {
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT,
        "Owner cannot leave without first transferring ownership",
      );
    }

    await friendGroups.removeMember(ctx.group.id, viewerId);
    return c.body(null, 204);
  })

  // ── TRANSFER OWNERSHIP (owner only) ─────────────────────────────────────
  .openapi(transferOwnership, async (c) => {
    const viewerId = getUserId(c);
    const { friendGroups } = c.get("repos");
    const { slug } = c.req.valid("param");
    const { userId: targetUserId } = c.req.valid("json");

    const ctx = await loadGroupForMember(c.get("repos"), slug, viewerId);
    requireRole(ctx.membership, "owner");

    if (targetUserId === viewerId) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "Cannot transfer to yourself");
    }
    const target = await friendGroups.getMembership(ctx.group.id, targetUserId);
    if (!target) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "Target must already be a member");
    }

    await friendGroups.transferOwnership(ctx.group.id, viewerId, targetUserId);
    return c.body(null, 204);
  })

  // ── UPDATE ROLE (admin+) ────────────────────────────────────────────────
  .openapi(updateRole, async (c) => {
    const viewerId = getUserId(c);
    const { friendGroups } = c.get("repos");
    const { slug, userId: targetUserId } = c.req.valid("param");
    const { role } = c.req.valid("json");

    const ctx = await loadGroupForMember(c.get("repos"), slug, viewerId);
    requireRole(ctx.membership, "admin");

    const target = await friendGroups.getMembership(ctx.group.id, targetUserId);
    if (!target) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Member not found");
    }
    if (target.role === "owner") {
      throw new AppError(409, ERROR_CODES.CONFLICT, "Cannot demote the owner");
    }

    const updated = await friendGroups.updateRole(ctx.group.id, targetUserId, role);
    if (!updated) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Member not found");
    }
    // Re-fetch with user join to return the full DTO.
    const members = await friendGroups.listMembers(ctx.group.id);
    const enriched = members.find((member) => member.userId === targetUserId);
    if (!enriched) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Member not found");
    }
    return c.json(toMember(enriched));
  })

  // ── UPDATE NICKNAME (self only) ─────────────────────────────────────────
  .openapi(updateNickname, async (c) => {
    const viewerId = getUserId(c);
    const { friendGroups } = c.get("repos");
    const { slug, userId: targetUserId } = c.req.valid("param");
    const { nickname } = c.req.valid("json");

    if (targetUserId !== viewerId) {
      throw new AppError(403, ERROR_CODES.FORBIDDEN, "Members can only edit their own nickname");
    }
    const ctx = await loadGroupForMember(c.get("repos"), slug, viewerId);

    const updated = await friendGroups.updateNickname(ctx.group.id, viewerId, nickname);
    if (!updated) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Member not found");
    }
    const members = await friendGroups.listMembers(ctx.group.id);
    const enriched = members.find((member) => member.userId === viewerId);
    if (!enriched) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Member not found");
    }
    return c.json(toMember(enriched));
  })

  // ── KICK MEMBER (admin+) ────────────────────────────────────────────────
  .openapi(kickMember, async (c) => {
    const viewerId = getUserId(c);
    const { friendGroups } = c.get("repos");
    const { slug, userId: targetUserId } = c.req.valid("param");

    const ctx = await loadGroupForMember(c.get("repos"), slug, viewerId);
    requireRole(ctx.membership, "admin");

    if (targetUserId === viewerId) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "Use /leave to remove yourself");
    }
    const target = await friendGroups.getMembership(ctx.group.id, targetUserId);
    if (!target) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Member not found");
    }
    if (target.role === "owner") {
      throw new AppError(409, ERROR_CODES.CONFLICT, "Cannot kick the owner");
    }
    if (target.role === "admin" && ctx.membership.role !== "owner") {
      throw new AppError(403, ERROR_CODES.FORBIDDEN, "Only the owner can remove admins");
    }

    await friendGroups.removeMember(ctx.group.id, targetUserId);
    return c.body(null, 204);
  })

  // ── SHAREABLE LISTS (viewer's own) ──────────────────────────────────────
  .openapi(shareableLists, async (c) => {
    const viewerId = getUserId(c);
    const { friendGroups } = c.get("repos");
    const { slug } = c.req.valid("param");

    const ctx = await loadGroupForMember(c.get("repos"), slug, viewerId);

    const rows = await friendGroups.listShareableForUserInGroup(ctx.group.id, viewerId);
    const response: FriendGroupShareableListsResponse = {
      items: rows.map((row) => ({
        listId: row.listId,
        listName: row.listName,
        listIntent:
          row.listIntent as FriendGroupShareableListsResponse["items"][number]["listIntent"],
        listKind: row.listKind as FriendGroupShareableListsResponse["items"][number]["listKind"],
        entryCount: row.entryCount,
        sharedAt: row.sharedAt ? row.sharedAt.toISOString() : null,
        tradeDefaults: {
          pricePref:
            row.defaultPricePref as FriendGroupShareableListsResponse["items"][number]["tradeDefaults"]["pricePref"],
          priceAbsoluteCents: row.defaultPriceAbsoluteCents,
          tradeType:
            row.defaultTradeType as FriendGroupShareableListsResponse["items"][number]["tradeDefaults"]["tradeType"],
        },
        currency: row.currency as FriendGroupShareableListsResponse["items"][number]["currency"],
      })),
    };
    return c.json(response);
  })

  // ── SHARE A LIST (self only) ────────────────────────────────────────────
  .openapi(shareList, async (c) => {
    const viewerId = getUserId(c);
    const { friendGroups, lists } = c.get("repos");
    const { slug } = c.req.valid("param");
    const { listId } = c.req.valid("json");

    const ctx = await loadGroupForMember(c.get("repos"), slug, viewerId);

    const list = await lists.getByIdForUser(listId, viewerId);
    if (!list) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "List not found");
    }

    await friendGroups.share(ctx.group.id, listId, viewerId);
    return c.body(null, 204);
  })

  // ── UNSHARE A LIST (self only) ──────────────────────────────────────────
  .openapi(unshareList, async (c) => {
    const viewerId = getUserId(c);
    const { friendGroups, lists } = c.get("repos");
    const { slug, listId } = c.req.valid("param");

    const ctx = await loadGroupForMember(c.get("repos"), slug, viewerId);

    const list = await lists.getByIdForUser(listId, viewerId);
    if (!list) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "List not found");
    }

    await friendGroups.unshare(ctx.group.id, listId);
    return c.body(null, 204);
  })

  // ── MATCH VIEW ──────────────────────────────────────────────────────────
  .openapi(getMatches, async (c) => {
    const viewerId = getUserId(c);
    const { slug } = c.req.valid("param");

    const ctx = await loadGroupForMember(c.get("repos"), slug, viewerId);

    const { friendGroupMatches } = c.get("repos");
    const [othersHaveYourWants, othersWantYourHaves] = await Promise.all([
      friendGroupMatches.othersHaveYourWants({ groupId: ctx.group.id, viewerUserId: viewerId }),
      friendGroupMatches.othersWantYourHaves({ groupId: ctx.group.id, viewerUserId: viewerId }),
    ]);

    return c.json({
      othersHaveYourWants,
      othersWantYourHaves,
    } satisfies FriendGroupMatchesResponse);
  })

  // ── SHARED LIST DETAIL (browsable by any group member) ──────────────────
  .openapi(getSharedList, async (c) => {
    const viewerId = getUserId(c);
    const { friendGroups, lists } = c.get("repos");
    const { slug, listId } = c.req.valid("param");

    const group = await friendGroups.getBySlug(slug);
    if (!group) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Group not found");
    }

    const shared = await friendGroups.getSharedList(group.id, listId, viewerId);
    if (!shared) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "List not shared with this group");
    }

    const kind = shared.list.kind as ListKind;
    const entries = await lists.entriesWithDetailsAnon(listId, kind);

    const response: FriendGroupSharedListDetailResponse = {
      list: {
        id: shared.list.id,
        name: shared.list.name,
        intent: shared.list.intent as ListIntent,
        kind,
        ownerUserId: shared.list.userId,
        ownerName: shared.ownerName,
        tradeDefaults: {
          pricePref: shared.list
            .defaultPricePref as FriendGroupSharedListDetailResponse["list"]["tradeDefaults"]["pricePref"],
          priceAbsoluteCents: shared.list.defaultPriceAbsoluteCents,
          tradeType: shared.list
            .defaultTradeType as FriendGroupSharedListDetailResponse["list"]["tradeDefaults"]["tradeType"],
        },
        currency: shared.list.currency as FriendGroupSharedListDetailResponse["list"]["currency"],
      },
      entries: entries.map((row) => toListEntryDetail(row)),
    };
    return c.json(response);
  })

  // ── MEMBER DETAIL ───────────────────────────────────────────────────────
  .openapi(getMemberDetail, async (c) => {
    const viewerId = getUserId(c);
    const { friendGroups, friendGroupMatches } = c.get("repos");
    const { slug, userId: counterpartyUserId } = c.req.valid("param");

    const ctx = await loadGroupForMember(c.get("repos"), slug, viewerId);

    const members = await friendGroups.listMembers(ctx.group.id);
    const counterparty = members.find((member) => member.userId === counterpartyUserId);
    if (!counterparty) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Member not found");
    }

    const [allShares, allCollectionShares] = await Promise.all([
      friendGroups.listSharesForGroup(ctx.group.id),
      friendGroups.collectionSharesForGroup(ctx.group.id),
    ]);
    const memberShares = allShares.filter((share) => share.userId === counterpartyUserId);
    const memberCollectionShares = allCollectionShares.filter(
      (share) => share.userId === counterpartyUserId,
    );

    const [matches, reverseMatches] = await Promise.all([
      friendGroupMatches.othersHaveYourWants({
        groupId: ctx.group.id,
        viewerUserId: viewerId,
        counterpartyUserId,
      }),
      friendGroupMatches.othersWantYourHaves({
        groupId: ctx.group.id,
        viewerUserId: viewerId,
        counterpartyUserId,
      }),
    ]);

    const response: FriendGroupMemberDetailResponse = {
      member: toMember(counterparty),
      shares: memberShares.map((row) => toShare(row)),
      collectionShares: memberCollectionShares.map((row) => toCollectionShare(row)),
      matches,
      reverseMatches,
    };
    return c.json(response);
  })

  // ── SHAREABLE COLLECTIONS (viewer's own) ────────────────────────────────
  .openapi(shareableCollections, async (c) => {
    const viewerId = getUserId(c);
    const { friendGroups } = c.get("repos");
    const { slug } = c.req.valid("param");

    const ctx = await loadGroupForMember(c.get("repos"), slug, viewerId);

    const rows = await friendGroups.collectionShareableForUserInGroup(ctx.group.id, viewerId);
    const response: FriendGroupShareableCollectionsResponse = {
      items: rows.map((row) => ({
        collectionId: row.collectionId,
        collectionName: row.collectionName,
        sharedAt: row.sharedAt ? row.sharedAt.toISOString() : null,
      })),
    };
    return c.json(response);
  })

  // ── SHARE A COLLECTION (self only) ──────────────────────────────────────
  .openapi(shareCollection, async (c) => {
    const viewerId = getUserId(c);
    const { friendGroups, collections } = c.get("repos");
    const { slug } = c.req.valid("param");
    const { collectionId } = c.req.valid("json");

    const ctx = await loadGroupForMember(c.get("repos"), slug, viewerId);

    // Confirm viewer owns this personal collection. Pooled collections will
    // be rejected by the composite FK anyway, but a 404 here is clearer than
    // a 500 from the DB.
    const access = await collections.getAccessForUser(collectionId, viewerId);
    if (!access || access.collection.userId !== viewerId) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Collection not found or not yours to share");
    }

    await friendGroups.shareCollection(ctx.group.id, collectionId, viewerId);
    return c.body(null, 204);
  })

  // ── UNSHARE A COLLECTION (self only) ────────────────────────────────────
  .openapi(unshareCollection, async (c) => {
    const viewerId = getUserId(c);
    const { friendGroups, collections } = c.get("repos");
    const { slug, collectionId } = c.req.valid("param");

    const ctx = await loadGroupForMember(c.get("repos"), slug, viewerId);

    const access = await collections.getAccessForUser(collectionId, viewerId);
    if (!access || access.collection.userId !== viewerId) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Collection not found");
    }

    await friendGroups.unshareCollection(ctx.group.id, collectionId);
    return c.body(null, 204);
  })

  // ── SHARED COLLECTION DETAIL (browsable by any group member) ────────────
  .openapi(getSharedCollection, async (c) => {
    const viewerId = getUserId(c);
    const repos = c.get("repos");
    const { friendGroups, copies, marketplace } = repos;
    const { slug, collectionId } = c.req.valid("param");

    const group = await friendGroups.getBySlug(slug);
    if (!group) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Group not found");
    }

    const shared = await friendGroups.getSharedCollection(group.id, collectionId, viewerId);
    if (!shared) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Collection not shared with this group");
    }

    // Value uses the owner's favorite marketplace, matching what the owner
    // sees and what the public-share-token page does.
    const favMarketplace = await getFavoriteMarketplace(repos, shared.collection.userId);
    const value = await marketplace.singleCollectionValue(collectionId, favMarketplace);
    // Full set (no pagination): the match computation below needs every copy.
    const copyRows = await copies.listForCollection(collectionId);

    const response: FriendGroupSharedCollectionDetailResponse = {
      collection: {
        id: shared.collection.id,
        name: shared.collection.name,
        description: shared.collection.description,
        copyCount: copyRows.length,
        totalValueCents: value?.totalValueCents ?? null,
        unpricedCopyCount: value?.unpricedCopyCount ?? null,
        ownerUserId: shared.collection.userId,
        ownerName: shared.ownerName,
      },
      copies: copyRows.map((row) => ({
        id: row.id,
        printingId: row.printingId,
        collectionId: row.collectionId,
        groupId: row.groupId,
      })),
      viewerRole: shared.viewerRole,
    };
    return c.json(response);
  });
