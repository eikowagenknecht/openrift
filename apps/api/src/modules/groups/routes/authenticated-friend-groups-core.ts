import { friendGroupsContract } from "@openrift/shared/contracts/friend-groups";
import { ERROR_CODES } from "@openrift/shared/error-codes";
import type {
  FriendGroupDetailResponse,
  FriendGroupListResponse,
  FriendGroupPendingRequestsCountResponse,
  FriendGroupResponse,
  FriendGroupSummaryResponse,
} from "@openrift/shared/types/api/friend-group";
import { implement } from "@orpc/server";

import { AppError } from "../../../errors.js";
import { generateShareToken } from "../../../lib/share-token.js";
import { requireAuthedUser } from "../../../orpc/base.js";
import type { ApiContext } from "../../../orpc/context.js";
import { expandRuleListCounts } from "../../lists/lib/list-counts.js";
import {
  COLLECTION_COVER_COUNT,
  canSeeCode,
  groupCovers,
  toCollectionShare,
  toGroup,
  toMember,
  toMemberPreview,
  toRequest,
  toShare,
} from "../lib/friend-group-presenters.js";
import { hasRole, loadGroupForMember, requireRole } from "../lib/group-access.js";

const os = implement(friendGroupsContract).$context<ApiContext>().use(requireAuthedUser);

export const friendGroupsCoreRouter = {
  list: os.list.handler(async ({ context }): Promise<FriendGroupListResponse> => {
    const userId = context.userId;
    const { friendGroups } = context.repos;
    const [groups, requests] = await Promise.all([
      friendGroups.listGroupsForUser(userId),
      friendGroups.listOwnRequestsForUser(userId),
    ]);
    return {
      items: groups.map((row): FriendGroupSummaryResponse => ({
        ...toGroup(row, canSeeCode(row.viewerRole)),
        viewerRole: row.viewerRole,
        memberCount: row.memberCount,
        pendingRequestCount: row.pendingRequestCount,
        sharedListCount: row.sharedListCount,
        memberPreviews: row.memberPreviews.map((preview) => toMemberPreview(preview)),
        recentTradedCardCount: row.recentTradedCardCount,
        tradedCardCount: row.tradedCardCount,
      })),
      outgoingRequests: requests.map((row) => ({
        id: row.id,
        groupId: row.groupId,
        groupSlug: row.groupSlug,
        groupName: row.groupName,
        createdAt: row.createdAt.toISOString(),
        memberCount: row.memberCount,
      })),
    };
  }),

  pendingRequestsCount: os.pendingRequestsCount.handler(
    async ({ context }): Promise<FriendGroupPendingRequestsCountResponse> => {
      const userId = context.userId;
      const { friendGroups } = context.repos;
      const count = await friendGroups.pendingRequestsCountForUser(userId);
      return { count };
    },
  ),

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

    const created = await friendGroups.createInvite(group.id, viewerId, "request");

    // Only a genuinely new row notifies: a repeat request on an existing invite
    // is a no-op insert, and mailing on it would let one person re-alert the
    // admins at will. Best-effort (the service swallows its own errors) so a
    // mail failure can never fail a request the visitor already made.
    if (created) {
      await context.services.notifyAdminsOfGroupJoinRequest(context.repos, {
        groupId: group.id,
        groupSlug: group.slug,
        groupName: group.name,
        requesterUserId: viewerId,
      });
    }
  }),

  get: os.get.handler(async ({ input, context }): Promise<FriendGroupDetailResponse> => {
    const viewerId = context.userId;
    const { friendGroups, lists, cardTrades, copies } = context.repos;

    const group = await friendGroups.getBySlugOrPrevious(input.slug);
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
        cardsTradedCount: 0,
        cardsTradedByMember: {},
      };
    }

    if (!membership) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Group not found");
    }

    const isAdmin = hasRole(membership.role, "admin");
    const [
      members,
      shares,
      collectionShares,
      pendingRequests,
      contactsByUser,
      cardsTradedCount,
      cardsTradedByMember,
    ] = await Promise.all([
      friendGroups.listMembers(group.id),
      friendGroups.listSharesForGroup(group.id),
      friendGroups.collectionSharesForGroup(group.id),
      isAdmin ? friendGroups.listRequestsForGroup(group.id) : Promise.resolve([]),
      friendGroups.getRevealedContactsForMembers(group.id),
      cardTrades.countCompletedCardsInGroup(group.id),
      cardTrades.countTradedCardsWithViewerInGroup(group.id, viewerId),
    ]);

    // The materialized `entryCount` counts only manual rows, so rule-based lists
    // report 0. Expand just those lists (manual lists are already exact) to show
    // their real size — the same expansion the list detail page uses.
    const [expandedCounts, shareCovers] = await Promise.all([
      expandRuleListCounts(lists, shares),
      copies.coverPrintingsAcross(
        collectionShares.map((row) => row.collectionId),
        COLLECTION_COVER_COUNT,
      ),
    ]);
    const coversByCollection = groupCovers(shareCovers);

    return {
      group: toGroup(group, canSeeCode(membership.role)),
      viewerStatus: "member",
      viewerRole: membership.role,
      members: members.map((row) => toMember(row, contactsByUser.get(row.userId) ?? [])),
      shares: shares.map((row) =>
        toShare({ ...row, entryCount: expandedCounts.get(row.listId) ?? row.entryCount }),
      ),
      collectionShares: collectionShares.map((row) =>
        toCollectionShare(row, coversByCollection.get(row.collectionId)),
      ),
      pendingRequests: pendingRequests.map((row) => toRequest(row)),
      cardsTradedCount,
      cardsTradedByMember: Object.fromEntries(cardsTradedByMember),
    };
  }),

  // Detailed input: path `slug` (current) and body `slug` (rename target) are
  // distinct, so they're kept in separate `params` / `body` envelopes.
  update: os.update.handler(async ({ input, context }): Promise<FriendGroupResponse> => {
    const viewerId = context.userId;
    const { friendGroups } = context.repos;
    const { slug } = input.params;
    const body = input.body;

    const ctx = await loadGroupForMember(context.repos, slug, viewerId);
    requireRole(ctx.membership, "admin");

    const isRename = Boolean(body.slug) && body.slug !== ctx.group.slug;
    if (body.slug && isRename) {
      // Exact-slug check on purpose: another group's stale rename alias must
      // not block taking a freed slug (current slugs win on lookup anyway).
      const existing = await friendGroups.getBySlug(body.slug);
      if (existing) {
        throw new AppError(409, ERROR_CODES.CONFLICT, "Slug already in use");
      }
    }

    const patched = await friendGroups.update(ctx.group.id, {
      slug: body.slug,
      // A rename keeps the old slug as a lookup alias so bookmarks and
      // in-flight trade emails keep resolving.
      ...(isRename ? { previousSlug: ctx.group.slug } : {}),
      name: body.name,
      description: body.description ?? undefined,
      updatedAt: new Date(),
    });
    if (!patched) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Group not found");
    }
    return toGroup(patched, true);
  }),

  remove: os.remove.handler(async ({ input, context }): Promise<void> => {
    const viewerId = context.userId;
    const { friendGroups } = context.repos;

    const ctx = await loadGroupForMember(context.repos, input.slug, viewerId);
    requireRole(ctx.membership, "owner");

    await friendGroups.deleteById(ctx.group.id);
  }),

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
};
