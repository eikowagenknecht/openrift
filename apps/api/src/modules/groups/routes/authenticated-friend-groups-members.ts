import { friendGroupsContract } from "@openrift/shared/contracts/friend-groups";
import { ERROR_CODES } from "@openrift/shared/error-codes";
import type {
  FriendGroupMemberDetailResponse,
  FriendGroupMemberResponse,
} from "@openrift/shared/types/api/friend-group";
import { implement } from "@orpc/server";

import { AppError } from "../../../errors.js";
import { requireAuthedUser } from "../../../orpc/base.js";
import type { ApiContext } from "../../../orpc/context.js";
import { expandRuleListCounts } from "../../lists/lib/list-counts.js";
import {
  COLLECTION_COVER_COUNT,
  groupCovers,
  toCollectionShare,
  toMember,
  toShare,
} from "../lib/friend-group-presenters.js";
import { hasRole, loadGroupForMember, requireRole } from "../lib/group-access.js";

const os = implement(friendGroupsContract).$context<ApiContext>().use(requireAuthedUser);

export const friendGroupsMembersRouter = {
  acceptInvite: os.acceptInvite.handler(async ({ input, context }): Promise<void> => {
    const viewerId = context.userId;
    const { friendGroups } = context.repos;
    const targetUserId = input.userId;

    const group = await friendGroups.getBySlugOrPrevious(input.slug);
    if (!group) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Group not found");
    }

    const invite = await friendGroups.getInvite(group.id, targetUserId);
    if (!invite) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "No pending invite");
    }

    const membership = await friendGroups.getMembership(group.id, viewerId);
    if (!membership || !hasRole(membership.role, "admin")) {
      throw new AppError(403, ERROR_CODES.FORBIDDEN, "Admin only");
    }

    // Add the member and consume the invite atomically so a failure can't
    // leave a member without clearing the pending invite (or vice versa).
    // Visibility is opt-in: the new member chooses which of their lists to
    // share with the group from the manage page after joining.
    await context.transact(async (repos) => {
      await repos.friendGroups.addMember(group.id, targetUserId, "member");
      await repos.friendGroups.deleteInvite(group.id, targetUserId);
    });

    // After the commit and outside the transaction: approval is otherwise
    // silent, and the service swallows its own errors so a mail failure can
    // never fail an approval that already landed.
    await context.services.notifyMemberOfGroupApproval(context.repos, {
      groupId: group.id,
      groupSlug: group.slug,
      groupName: group.name,
      memberUserId: targetUserId,
    });
  }),

  declineInvite: os.declineInvite.handler(async ({ input, context }): Promise<void> => {
    const viewerId = context.userId;
    const { friendGroups } = context.repos;
    const targetUserId = input.userId;

    const group = await friendGroups.getBySlugOrPrevious(input.slug);
    if (!group) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Group not found");
    }

    const invite = await friendGroups.getInvite(group.id, targetUserId);
    if (!invite) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "No pending invite");
    }

    if (targetUserId !== viewerId) {
      const membership = await friendGroups.getMembership(group.id, viewerId);
      if (!membership || !hasRole(membership.role, "admin")) {
        throw new AppError(403, ERROR_CODES.FORBIDDEN, "Forbidden");
      }
    }

    await friendGroups.deleteInvite(group.id, targetUserId);
  }),

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
    // atomically with dropping membership.
    await context.transact(async (trxRepos) => {
      await trxRepos.cardTrades.cancelForDepartingMember(ctx.group.id, viewerId);
      await trxRepos.friendGroups.removeMember(ctx.group.id, viewerId);
    });
  }),

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
      if ((target.role === "admin" || input.role === "admin") && ctx.membership.role !== "owner") {
        throw new AppError(403, ERROR_CODES.FORBIDDEN, "Only the owner can change admins");
      }

      const updated = await friendGroups.updateRole(ctx.group.id, targetUserId, input.role);
      if (!updated) {
        throw new AppError(404, ERROR_CODES.NOT_FOUND, "Member not found");
      }
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
    // copies) atomically with dropping membership.
    await context.transact(async (trxRepos) => {
      await trxRepos.cardTrades.cancelForDepartingMember(ctx.group.id, targetUserId);
      await trxRepos.friendGroups.removeMember(ctx.group.id, targetUserId);
    });
  }),

  getMemberDetail: os.getMemberDetail.handler(
    async ({ input, context }): Promise<FriendGroupMemberDetailResponse> => {
      const viewerId = context.userId;
      const { friendGroups, lists, copies } = context.repos;
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

      // Rule-based lists materialize 0 rows, so expand their real counts here
      // too — the trades page (`get`) does the same.
      const [expandedCounts, shareCovers] = await Promise.all([
        expandRuleListCounts(lists, memberShares),
        copies.coverPrintingsAcross(
          memberCollectionShares.map((share) => share.collectionId),
          COLLECTION_COVER_COUNT,
        ),
      ]);
      const coversByCollection = groupCovers(shareCovers);

      return {
        member: toMember(counterparty, contactsByUser.get(counterpartyUserId) ?? []),
        shares: memberShares.map((row) =>
          toShare({ ...row, entryCount: expandedCounts.get(row.listId) ?? row.entryCount }),
        ),
        collectionShares: memberCollectionShares.map((row) =>
          toCollectionShare(row, coversByCollection.get(row.collectionId)),
        ),
      };
    },
  ),
};
