import { friendGroupsContract } from "@openrift/shared/contracts/friend-groups";
import type {
  FriendGroupActivityEvent,
  FriendGroupActivityResponse,
  FriendGroupBoxWantsResponse,
  FriendGroupMatchesResponse,
} from "@openrift/shared/types/api/friend-group";
import type { ListIntent, ListKind } from "@openrift/shared/types/api/list";
import { implement } from "@orpc/server";

import { requireAuthedUser } from "../../../orpc/base.js";
import type { ApiContext } from "../../../orpc/context.js";
import { gravatarHashForEmail } from "../../users/lib/gravatar.js";
import { loadGroupForMember } from "../lib/group-access.js";

const os = implement(friendGroupsContract).$context<ApiContext>().use(requireAuthedUser);

export const friendGroupsActivityRouter = {
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

  boxWants: os.boxWants.handler(
    async ({ input, context }): Promise<FriendGroupBoxWantsResponse> => {
      const viewerId = context.userId;

      const ctx = await loadGroupForMember(context.repos, input.slug, viewerId);

      const items = await context.repos.friendGroupMatches.boxWantsForViewer({
        groupId: ctx.group.id,
        viewerUserId: viewerId,
      });

      return { items };
    },
  ),

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
        ...completedTrades.map((trade): FriendGroupActivityEvent => ({
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
        })),
        ...members.map((member): FriendGroupActivityEvent => ({
          kind: "member-joined",
          at: member.joinedAt.toISOString(),
          userId: member.userId,
          userName: member.userName,
          userImage: member.userImage,
          gravatarHash: gravatarHashForEmail(member.userEmail),
        })),
        ...shares.map((share): FriendGroupActivityEvent => ({
          kind: "list-shared",
          at: share.sharedAt.toISOString(),
          userId: share.userId,
          userName: share.userName,
          listId: share.listId,
          listName: share.listName,
          listIntent: share.listIntent as ListIntent,
          listKind: share.listKind as ListKind,
        })),
        ...collectionShares.map((share): FriendGroupActivityEvent => ({
          kind: "collection-shared",
          at: share.sharedAt.toISOString(),
          userId: share.userId,
          userName: share.userName,
          collectionId: share.collectionId,
          collectionName: share.collectionName,
        })),
        ...matches.map((match): FriendGroupActivityEvent => ({
          kind: "match",
          at: match.matchedAt.toISOString(),
          counterpartyUserId: match.counterpartyUserId,
          counterpartyName: match.counterpartyName,
          counterpartyImage: match.counterpartyImage,
          counterpartyGravatarHash: match.counterpartyGravatarHash,
          printingId: match.printingId,
          cardId: match.cardId,
        })),
      ];

      // Newest first by ISO timestamp (lexicographic order matches chronological
      // order for same-offset ISO strings).
      events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

      return { events: events.slice(0, FEED_LIMIT) };
    },
  ),
};
