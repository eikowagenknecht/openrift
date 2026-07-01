import { ERROR_CODES } from "@openrift/shared";
import type {
  ContactMethod,
  FriendGroupActivityEvent,
  FriendGroupActivityResponse,
  FriendGroupCollectionShareResponse,
  FriendGroupDetailResponse,
  FriendGroupJoinPreviewResponse,
  FriendGroupListResponse,
  FriendGroupMatchesResponse,
  FriendGroupMemberDetailResponse,
  FriendGroupMemberResponse,
  FriendGroupPendingInvitesCountResponse,
  FriendGroupPendingRequestsCountResponse,
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
import { friendGroupsContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import { AppError } from "../../errors.js";
import { gravatarHashForEmail } from "../../lib/gravatar.js";
import { hasRole, loadGroupForMember, requireRole } from "../../lib/group-access.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import type { Group, MemberWithUser } from "../../repositories/friend-groups.js";
import { toListEntryDetail } from "../../utils/mappers.js";
import { getFavoriteMarketplace } from "../../utils/preferences.js";
import { generateShareToken } from "../../utils/share-token.js";

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

function toMember(row: MemberWithUser, contactMethods: ContactMethod[]): FriendGroupMemberResponse {
  return {
    userId: row.userId,
    userName: row.userName,
    userImage: row.userImage,
    gravatarHash: gravatarHashForEmail(row.userEmail),
    role: row.role,
    contactMethods,
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
  copyCount: number;
}

function toCollectionShare(row: CollectionShareRow): FriendGroupCollectionShareResponse {
  return {
    groupId: row.groupId,
    collectionId: row.collectionId,
    collectionName: row.collectionName,
    userId: row.userId,
    userName: row.userName,
    sharedAt: row.sharedAt.toISOString(),
    copyCount: row.copyCount,
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

function canSeeCode(role: FriendGroupRole): boolean {
  return hasRole(role, "admin");
}

const os = implement(friendGroupsContract).$context<ApiContext>().use(requireAuthedUser);

/**
 * The friend-groups contract, mounted at `/api/v1/friend-groups`. Role checks /
 * not-found / conflict / bad-request states are thrown as `AppError` and mapped
 * by the handler's appErrorInterceptor.
 */
export const friendGroupsRouter = {
  // ── LIST ────────────────────────────────────────────────────────────────
  list: os.list.handler(async ({ context }): Promise<FriendGroupListResponse> => {
    const userId = context.userId;
    const { friendGroups } = context.repos;
    const [groups, invites, requests] = await Promise.all([
      friendGroups.listGroupsForUser(userId),
      friendGroups.listInvitesForUser(userId),
      friendGroups.listOwnRequestsForUser(userId),
    ]);
    const toInviteEntry = (row: (typeof invites)[number]) => ({
      id: row.id,
      groupId: row.groupId,
      groupSlug: row.groupSlug,
      groupName: row.groupName,
      createdAt: row.createdAt.toISOString(),
    });
    return {
      items: groups.map(
        (row): FriendGroupSummaryResponse => ({
          ...toGroup(row, canSeeCode(row.viewerRole)),
          viewerRole: row.viewerRole,
          memberCount: row.memberCount,
          pendingRequestCount: row.pendingRequestCount,
        }),
      ),
      pendingInvites: invites.map((row) => toInviteEntry(row)),
      outgoingRequests: requests.map((row) => toInviteEntry(row)),
    };
  }),

  // ── BADGE COUNT ─────────────────────────────────────────────────────────
  pendingInvitesCount: os.pendingInvitesCount.handler(
    async ({ context }): Promise<FriendGroupPendingInvitesCountResponse> => {
      const userId = context.userId;
      const { friendGroups } = context.repos;
      const count = await friendGroups.pendingInvitesCountForUser(userId);
      return { count };
    },
  ),

  pendingRequestsCount: os.pendingRequestsCount.handler(
    async ({ context }): Promise<FriendGroupPendingRequestsCountResponse> => {
      const userId = context.userId;
      const { friendGroups } = context.repos;
      const count = await friendGroups.pendingRequestsCountForUser(userId);
      return { count };
    },
  ),

  // ── CREATE ──────────────────────────────────────────────────────────────
  create: os.create.handler(async ({ input, context }): Promise<FriendGroupResponse> => {
    const userId = context.userId;
    const { friendGroups } = context.repos;

    if (await friendGroups.getBySlug(input.slug)) {
      throw new AppError(409, ERROR_CODES.CONFLICT, "Slug already in use");
    }

    const group = await friendGroups.createWithOwner(
      {
        slug: input.slug,
        name: input.name,
        description: input.description ?? null,
        code: input.generateCode ? generateShareToken() : null,
      },
      userId,
    );
    return toGroup(group, true);
  }),

  // ── JOIN PREVIEW ────────────────────────────────────────────────────────
  preview: os.preview.handler(
    async ({ input, context }): Promise<FriendGroupJoinPreviewResponse> => {
      const viewerId = context.userId;
      const { friendGroups } = context.repos;

      const group = await friendGroups.getByCode(input.code);
      if (!group) {
        throw new AppError(404, ERROR_CODES.NOT_FOUND, "No group matches that code");
      }

      const [members, existingMembership, existingInvite] = await Promise.all([
        friendGroups.listMembers(group.id),
        friendGroups.getMembership(group.id, viewerId),
        friendGroups.getInvite(group.id, viewerId),
      ]);

      const viewerStatus = existingMembership ? "member" : existingInvite ? "pending" : "available";

      return {
        id: group.id,
        slug: group.slug,
        name: group.name,
        description: group.description,
        memberCount: members.length,
        viewerStatus,
      };
    },
  ),

  // ── JOIN (submits a request) ────────────────────────────────────────────
  join: os.join.handler(async ({ input, context }): Promise<void> => {
    const viewerId = context.userId;
    const { friendGroups } = context.repos;

    const group = await friendGroups.getByCode(input.code);
    if (!group) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "No group matches that code");
    }

    const existingMembership = await friendGroups.getMembership(group.id, viewerId);
    if (existingMembership) {
      throw new AppError(409, ERROR_CODES.CONFLICT, "You are already a member of that group");
    }

    await friendGroups.createInvite(group.id, viewerId, "request");
  }),

  // ── DETAIL ──────────────────────────────────────────────────────────────
  get: os.get.handler(async ({ input, context }): Promise<FriendGroupDetailResponse> => {
    const viewerId = context.userId;
    const { friendGroups } = context.repos;

    const group = await friendGroups.getBySlug(input.slug);
    if (!group) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Group not found");
    }

    const [membership, invite] = await Promise.all([
      friendGroups.getMembership(group.id, viewerId),
      friendGroups.getInvite(group.id, viewerId),
    ]);

    if (!membership && invite?.direction === "request") {
      return {
        group: toGroup(group, false),
        viewerStatus: "pending",
        viewerRole: null,
        members: [],
        shares: [],
        collectionShares: [],
        pendingRequests: [],
      };
    }

    if (!membership) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Group not found");
    }

    const isAdmin = hasRole(membership.role, "admin");
    const [members, shares, collectionShares, pendingRequests, contactsByUser] = await Promise.all([
      friendGroups.listMembers(group.id),
      friendGroups.listSharesForGroup(group.id),
      friendGroups.collectionSharesForGroup(group.id),
      isAdmin ? friendGroups.listRequestsForGroup(group.id) : Promise.resolve([]),
      friendGroups.getRevealedContactsForMembers(group.id),
    ]);

    return {
      group: toGroup(group, canSeeCode(membership.role)),
      viewerStatus: "member",
      viewerRole: membership.role,
      members: members.map((row) => toMember(row, contactsByUser.get(row.userId) ?? [])),
      shares: shares.map((row) => toShare(row)),
      collectionShares: collectionShares.map((row) => toCollectionShare(row)),
      pendingRequests: pendingRequests.map((row) => toRequest(row)),
    };
  }),

  // ── UPDATE METADATA (admin+) ────────────────────────────────────────────
  // Detailed input: path `slug` (current) and body `slug` (rename target) are
  // distinct, so they're kept in separate `params` / `body` envelopes.
  update: os.update.handler(async ({ input, context }): Promise<FriendGroupResponse> => {
    const viewerId = context.userId;
    const { friendGroups } = context.repos;
    const { slug } = input.params;
    const body = input.body;

    const ctx = await loadGroupForMember(context.repos, slug, viewerId);
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
    return toGroup(patched, true);
  }),

  // ── DELETE (owner only) ─────────────────────────────────────────────────
  remove: os.remove.handler(async ({ input, context }): Promise<void> => {
    const viewerId = context.userId;
    const { friendGroups } = context.repos;

    const ctx = await loadGroupForMember(context.repos, input.slug, viewerId);
    requireRole(ctx.membership, "owner");

    await friendGroups.deleteById(ctx.group.id);
  }),

  // ── ROTATE CODE (admin+) ────────────────────────────────────────────────
  rotateCode: os.rotateCode.handler(async ({ input, context }): Promise<FriendGroupResponse> => {
    const viewerId = context.userId;
    const { friendGroups } = context.repos;

    const ctx = await loadGroupForMember(context.repos, input.slug, viewerId);
    requireRole(ctx.membership, "admin");

    const updated = await friendGroups.setCode(ctx.group.id, generateShareToken());
    if (!updated) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Group not found");
    }
    return toGroup(updated, true);
  }),

  // ── DISABLE CODE (admin+) ───────────────────────────────────────────────
  disableCode: os.disableCode.handler(async ({ input, context }): Promise<FriendGroupResponse> => {
    const viewerId = context.userId;
    const { friendGroups } = context.repos;

    const ctx = await loadGroupForMember(context.repos, input.slug, viewerId);
    requireRole(ctx.membership, "admin");

    const updated = await friendGroups.setCode(ctx.group.id, null);
    if (!updated) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Group not found");
    }
    return toGroup(updated, true);
  }),

  // ── RE-ENABLE CODE (admin+) ─────────────────────────────────────────────
  enableCode: os.enableCode.handler(async ({ input, context }): Promise<FriendGroupResponse> => {
    const viewerId = context.userId;
    const { friendGroups } = context.repos;

    const ctx = await loadGroupForMember(context.repos, input.slug, viewerId);
    requireRole(ctx.membership, "admin");

    const updated = await friendGroups.setCode(ctx.group.id, generateShareToken());
    if (!updated) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Group not found");
    }
    return toGroup(updated, true);
  }),

  // ── INVITE BY EMAIL (admin+) ────────────────────────────────────────────
  inviteByEmail: os.inviteByEmail.handler(async ({ input, context }): Promise<void> => {
    const viewerId = context.userId;
    const { friendGroups, users } = context.repos;

    const ctx = await loadGroupForMember(context.repos, input.slug, viewerId);
    requireRole(ctx.membership, "admin");

    const target = await users.getByEmail(input.email);
    if (!target) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "No user with that email");
    }

    const existingMembership = await friendGroups.getMembership(ctx.group.id, target.id);
    if (existingMembership) {
      throw new AppError(409, ERROR_CODES.CONFLICT, "User is already a member");
    }

    await friendGroups.createInvite(ctx.group.id, target.id, "invite");
  }),

  // ── ACCEPT (invite or request) ──────────────────────────────────────────
  acceptInvite: os.acceptInvite.handler(async ({ input, context }): Promise<void> => {
    const viewerId = context.userId;
    const { friendGroups } = context.repos;
    const targetUserId = input.userId;

    const group = await friendGroups.getBySlug(input.slug);
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
      if (!membership || !hasRole(membership.role, "admin")) {
        throw new AppError(403, ERROR_CODES.FORBIDDEN, "Admin only");
      }
    }

    // Add the member and consume the invite atomically so a failure can't
    // leave a member without clearing the pending invite (or vice versa).
    // Visibility is opt-in (ADR-013): the new member chooses which of their
    // lists to share with the group from the manage page after joining.
    await context.transact(async (repos) => {
      await repos.friendGroups.addMember(group.id, targetUserId, "member");
      await repos.friendGroups.deleteInvite(group.id, targetUserId);
    });
  }),

  // ── DECLINE (invite or request) ─────────────────────────────────────────
  declineInvite: os.declineInvite.handler(async ({ input, context }): Promise<void> => {
    const viewerId = context.userId;
    const { friendGroups } = context.repos;
    const targetUserId = input.userId;

    const group = await friendGroups.getBySlug(input.slug);
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
      if (!membership || !hasRole(membership.role, "admin")) {
        throw new AppError(403, ERROR_CODES.FORBIDDEN, "Forbidden");
      }
    }

    await friendGroups.deleteInvite(group.id, targetUserId);
  }),

  // ── LEAVE ───────────────────────────────────────────────────────────────
  leave: os.leave.handler(async ({ input, context }): Promise<void> => {
    const viewerId = context.userId;

    const ctx = await loadGroupForMember(context.repos, input.slug, viewerId);
    if (ctx.membership.role === "owner") {
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT,
        "Owner cannot leave without first transferring ownership",
      );
    }

    // Cancel the leaver's live trades in this group (releasing reserved copies)
    // atomically with dropping membership (ADR-019).
    await context.transact(async (trxRepos) => {
      await trxRepos.cardTrades.cancelForDepartingMember(ctx.group.id, viewerId);
      await trxRepos.friendGroups.removeMember(ctx.group.id, viewerId);
    });
  }),

  // ── TRANSFER OWNERSHIP (owner only) ─────────────────────────────────────
  transferOwnership: os.transferOwnership.handler(async ({ input, context }): Promise<void> => {
    const viewerId = context.userId;
    const { friendGroups } = context.repos;
    const targetUserId = input.userId;

    const ctx = await loadGroupForMember(context.repos, input.slug, viewerId);
    requireRole(ctx.membership, "owner");

    if (targetUserId === viewerId) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "Cannot transfer to yourself");
    }
    const target = await friendGroups.getMembership(ctx.group.id, targetUserId);
    if (!target) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "Target must already be a member");
    }

    await friendGroups.transferOwnership(ctx.group.id, viewerId, targetUserId);
  }),

  // ── UPDATE ROLE (admin+) ────────────────────────────────────────────────
  updateRole: os.updateRole.handler(
    async ({ input, context }): Promise<FriendGroupMemberResponse> => {
      const viewerId = context.userId;
      const { friendGroups } = context.repos;
      const targetUserId = input.userId;

      const ctx = await loadGroupForMember(context.repos, input.slug, viewerId);
      requireRole(ctx.membership, "admin");

      const target = await friendGroups.getMembership(ctx.group.id, targetUserId);
      if (!target) {
        throw new AppError(404, ERROR_CODES.NOT_FOUND, "Member not found");
      }
      if (target.role === "owner") {
        throw new AppError(409, ERROR_CODES.CONFLICT, "Cannot demote the owner");
      }
      // Only the owner may promote to or demote from admin.
      if ((target.role === "admin" || input.role === "admin") && ctx.membership.role !== "owner") {
        throw new AppError(403, ERROR_CODES.FORBIDDEN, "Only the owner can change admins");
      }

      const updated = await friendGroups.updateRole(ctx.group.id, targetUserId, input.role);
      if (!updated) {
        throw new AppError(404, ERROR_CODES.NOT_FOUND, "Member not found");
      }
      // Re-fetch with user join to return the full DTO.
      const [members, contactsByUser] = await Promise.all([
        friendGroups.listMembers(ctx.group.id),
        friendGroups.getRevealedContactsForMembers(ctx.group.id),
      ]);
      const enriched = members.find((member) => member.userId === targetUserId);
      if (!enriched) {
        throw new AppError(404, ERROR_CODES.NOT_FOUND, "Member not found");
      }
      return toMember(enriched, contactsByUser.get(targetUserId) ?? []);
    },
  ),

  // ── SET REVEALED CONTACTS (self only) ───────────────────────────────────
  setRevealedContacts: os.setRevealedContacts.handler(
    async ({ input, context }): Promise<FriendGroupMemberResponse> => {
      const viewerId = context.userId;
      const { friendGroups } = context.repos;
      const targetUserId = input.userId;

      if (targetUserId !== viewerId) {
        throw new AppError(403, ERROR_CODES.FORBIDDEN, "Members can only edit their own contacts");
      }
      const ctx = await loadGroupForMember(context.repos, input.slug, viewerId);

      await friendGroups.setRevealedContacts(ctx.group.id, viewerId, input.contactMethodIds);

      const [members, contactsByUser] = await Promise.all([
        friendGroups.listMembers(ctx.group.id),
        friendGroups.getRevealedContactsForMembers(ctx.group.id),
      ]);
      const enriched = members.find((member) => member.userId === viewerId);
      if (!enriched) {
        throw new AppError(404, ERROR_CODES.NOT_FOUND, "Member not found");
      }
      return toMember(enriched, contactsByUser.get(viewerId) ?? []);
    },
  ),

  // ── KICK MEMBER (admin+) ────────────────────────────────────────────────
  kickMember: os.kickMember.handler(async ({ input, context }): Promise<void> => {
    const viewerId = context.userId;
    const { friendGroups } = context.repos;
    const targetUserId = input.userId;

    const ctx = await loadGroupForMember(context.repos, input.slug, viewerId);
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

    // Cancel the kicked member's live trades in this group (releasing reserved
    // copies) atomically with dropping membership (ADR-019).
    await context.transact(async (trxRepos) => {
      await trxRepos.cardTrades.cancelForDepartingMember(ctx.group.id, targetUserId);
      await trxRepos.friendGroups.removeMember(ctx.group.id, targetUserId);
    });
  }),

  // ── SHAREABLE LISTS (viewer's own) ──────────────────────────────────────
  shareableLists: os.shareableLists.handler(
    async ({ input, context }): Promise<FriendGroupShareableListsResponse> => {
      const viewerId = context.userId;
      const { friendGroups } = context.repos;

      const ctx = await loadGroupForMember(context.repos, input.slug, viewerId);

      const rows = await friendGroups.listShareableForUserInGroup(ctx.group.id, viewerId);
      return {
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
          hasRule: row.hasRule,
        })),
      };
    },
  ),

  // ── SHARE A LIST (self only) ────────────────────────────────────────────
  shareList: os.shareList.handler(async ({ input, context }): Promise<void> => {
    const viewerId = context.userId;
    const { friendGroups, lists } = context.repos;

    const ctx = await loadGroupForMember(context.repos, input.slug, viewerId);

    const list = await lists.getByIdForUser(input.listId, viewerId);
    if (!list) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "List not found");
    }

    await friendGroups.share(ctx.group.id, input.listId, viewerId);
  }),

  // ── UNSHARE A LIST (self only) ──────────────────────────────────────────
  unshareList: os.unshareList.handler(async ({ input, context }): Promise<void> => {
    const viewerId = context.userId;
    const { friendGroups, lists } = context.repos;

    const ctx = await loadGroupForMember(context.repos, input.slug, viewerId);

    const list = await lists.getByIdForUser(input.listId, viewerId);
    if (!list) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "List not found");
    }

    await friendGroups.unshare(ctx.group.id, input.listId);
  }),

  // ── MATCH VIEW ──────────────────────────────────────────────────────────
  matches: os.matches.handler(async ({ input, context }): Promise<FriendGroupMatchesResponse> => {
    const viewerId = context.userId;

    const ctx = await loadGroupForMember(context.repos, input.slug, viewerId);

    const { friendGroupMatches } = context.repos;
    const [othersHaveYourWants, othersWantYourHaves] = await Promise.all([
      friendGroupMatches.othersHaveYourWants({ groupId: ctx.group.id, viewerUserId: viewerId }),
      friendGroupMatches.othersWantYourHaves({ groupId: ctx.group.id, viewerUserId: viewerId }),
    ]);

    return { othersHaveYourWants, othersWantYourHaves };
  }),

  // ── SHARED LIST DETAIL (browsable by any group member) ──────────────────
  getSharedList: os.getSharedList.handler(
    async ({ input, context }): Promise<FriendGroupSharedListDetailResponse> => {
      const viewerId = context.userId;
      const { friendGroups, lists } = context.repos;

      const group = await friendGroups.getBySlug(input.slug);
      if (!group) {
        throw new AppError(404, ERROR_CODES.NOT_FOUND, "Group not found");
      }

      const shared = await friendGroups.getSharedList(group.id, input.listId, viewerId);
      if (!shared) {
        throw new AppError(404, ERROR_CODES.NOT_FOUND, "List not shared with this group");
      }

      const kind = shared.list.kind as ListKind;
      const entries = await lists.entriesWithDetailsAnon(input.listId, kind);

      return {
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
    },
  ),

  // ── MEMBER DETAIL ───────────────────────────────────────────────────────
  getMemberDetail: os.getMemberDetail.handler(
    async ({ input, context }): Promise<FriendGroupMemberDetailResponse> => {
      const viewerId = context.userId;
      const { friendGroups, friendGroupMatches } = context.repos;
      const counterpartyUserId = input.userId;

      const ctx = await loadGroupForMember(context.repos, input.slug, viewerId);

      const [members, contactsByUser] = await Promise.all([
        friendGroups.listMembers(ctx.group.id),
        friendGroups.getRevealedContactsForMembers(ctx.group.id),
      ]);
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

      return {
        member: toMember(counterparty, contactsByUser.get(counterpartyUserId) ?? []),
        shares: memberShares.map((row) => toShare(row)),
        collectionShares: memberCollectionShares.map((row) => toCollectionShare(row)),
        matches,
        reverseMatches,
      };
    },
  ),

  // ── SHAREABLE COLLECTIONS (viewer's own) ────────────────────────────────
  shareableCollections: os.shareableCollections.handler(
    async ({ input, context }): Promise<FriendGroupShareableCollectionsResponse> => {
      const viewerId = context.userId;
      const { friendGroups } = context.repos;

      const ctx = await loadGroupForMember(context.repos, input.slug, viewerId);

      const rows = await friendGroups.collectionShareableForUserInGroup(ctx.group.id, viewerId);
      return {
        items: rows.map((row) => ({
          collectionId: row.collectionId,
          collectionName: row.collectionName,
          sharedAt: row.sharedAt ? row.sharedAt.toISOString() : null,
        })),
      };
    },
  ),

  // ── SHARE A COLLECTION (self only) ──────────────────────────────────────
  shareCollection: os.shareCollection.handler(async ({ input, context }): Promise<void> => {
    const viewerId = context.userId;
    const { friendGroups, collections } = context.repos;

    const ctx = await loadGroupForMember(context.repos, input.slug, viewerId);

    // Confirm viewer owns this personal collection. Pooled collections will
    // be rejected by the composite FK anyway, but a 404 here is clearer than
    // a 500 from the DB.
    const access = await collections.getAccessForUser(input.collectionId, viewerId);
    if (!access || access.collection.userId !== viewerId) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Collection not found or not yours to share");
    }

    await friendGroups.shareCollection(ctx.group.id, input.collectionId, viewerId);
  }),

  // ── UNSHARE A COLLECTION (self only) ────────────────────────────────────
  unshareCollection: os.unshareCollection.handler(async ({ input, context }): Promise<void> => {
    const viewerId = context.userId;
    const { friendGroups, collections } = context.repos;

    const ctx = await loadGroupForMember(context.repos, input.slug, viewerId);

    const access = await collections.getAccessForUser(input.collectionId, viewerId);
    if (!access || access.collection.userId !== viewerId) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Collection not found");
    }

    await friendGroups.unshareCollection(ctx.group.id, input.collectionId);
  }),

  // ── SHARED COLLECTION DETAIL (browsable by any group member) ────────────
  getSharedCollection: os.getSharedCollection.handler(
    async ({ input, context }): Promise<FriendGroupSharedCollectionDetailResponse> => {
      const viewerId = context.userId;
      const repos = context.repos;
      const { friendGroups, copies, marketplace } = repos;

      const group = await friendGroups.getBySlug(input.slug);
      if (!group) {
        throw new AppError(404, ERROR_CODES.NOT_FOUND, "Group not found");
      }

      const shared = await friendGroups.getSharedCollection(group.id, input.collectionId, viewerId);
      if (!shared) {
        throw new AppError(404, ERROR_CODES.NOT_FOUND, "Collection not shared with this group");
      }

      // Value uses the owner's favorite marketplace, matching what the owner
      // sees and what the public-share-token page does.
      const favMarketplace = await getFavoriteMarketplace(repos, shared.collection.userId);
      const value = await marketplace.singleCollectionValue(input.collectionId, favMarketplace);
      // Full set (no pagination): the shared-collection detail view renders every
      // copy and reports the exact copyCount. Unbounded by design today.
      const copyRows = await copies.listForCollection(input.collectionId);

      return {
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
    },
  ),

  // ── ACTIVITY FEED ───────────────────────────────────────────────────────
  activity: os.activity.handler(
    async ({ input, context }): Promise<FriendGroupActivityResponse> => {
      const viewerId = context.userId;

      const ctx = await loadGroupForMember(context.repos, input.slug, viewerId);
      const { friendGroups, cardTrades, friendGroupMatches } = context.repos;

      // One bound per source; the merged list is sliced to the same bound after
      // sorting, so older events from any single source fall away.
      const FEED_LIMIT = 30;
      const [completedTrades, members, shares, collectionShares, matches] = await Promise.all([
        cardTrades.recentCompletedInGroup(ctx.group.id, FEED_LIMIT),
        friendGroups.listMembers(ctx.group.id),
        friendGroups.listSharesForGroup(ctx.group.id),
        friendGroups.collectionSharesForGroup(ctx.group.id),
        friendGroupMatches.recentIncomingMatchesForFeed({
          groupId: ctx.group.id,
          viewerUserId: viewerId,
          limit: FEED_LIMIT,
        }),
      ]);

      const events: FriendGroupActivityEvent[] = [
        ...completedTrades.map(
          (trade): FriendGroupActivityEvent => ({
            kind: "trade-completed",
            at: trade.completedAt.toISOString(),
            tradeId: trade.tradeId,
            printingId: trade.printingId,
            cardId: trade.cardId,
            quantity: trade.quantity,
            giverUserId: trade.giverUserId,
            giverName: trade.giverName,
            receiverUserId: trade.receiverUserId,
            receiverName: trade.receiverName,
          }),
        ),
        ...members.map(
          (member): FriendGroupActivityEvent => ({
            kind: "member-joined",
            at: member.joinedAt.toISOString(),
            userId: member.userId,
            userName: member.userName,
            userImage: member.userImage,
            gravatarHash: gravatarHashForEmail(member.userEmail),
          }),
        ),
        ...shares.map(
          (share): FriendGroupActivityEvent => ({
            kind: "list-shared",
            at: share.sharedAt.toISOString(),
            userId: share.userId,
            userName: share.userName,
            listId: share.listId,
            listName: share.listName,
            listIntent: share.listIntent as ListIntent,
            listKind: share.listKind as ListKind,
          }),
        ),
        ...collectionShares.map(
          (share): FriendGroupActivityEvent => ({
            kind: "collection-shared",
            at: share.sharedAt.toISOString(),
            userId: share.userId,
            userName: share.userName,
            collectionId: share.collectionId,
            collectionName: share.collectionName,
          }),
        ),
        ...matches.map(
          (match): FriendGroupActivityEvent => ({
            kind: "match",
            at: match.matchedAt.toISOString(),
            counterpartyUserId: match.counterpartyUserId,
            counterpartyName: match.counterpartyName,
            counterpartyImage: match.counterpartyImage,
            counterpartyGravatarHash: match.counterpartyGravatarHash,
            printingId: match.printingId,
            cardId: match.cardId,
          }),
        ),
      ];

      // Newest first by ISO timestamp (lexicographic order matches chronological
      // order for same-offset ISO strings).
      events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

      return { events: events.slice(0, FEED_LIMIT) };
    },
  ),
};
