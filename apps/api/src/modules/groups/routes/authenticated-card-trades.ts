import { cardTradesContract } from "@openrift/shared/contracts/card-trades";
import { ERROR_CODES } from "@openrift/shared/error-codes";
import type {
  CardTradeActionCountsResponse,
  CardTradeCopyOptionsResponse,
  CardTradeListResponse,
  CardTradeLiveByPrintingResponse,
  CardTradeResponse,
  CardTradeSheetResponse,
} from "@openrift/shared/types/api/card-trade";
import { implement } from "@orpc/server";

import { AppError } from "../../../errors.js";
import { requireAuthedUser } from "../../../orpc/base.js";
import type { ApiContext } from "../../../orpc/context.js";
import {
  toCardTradeCounterparty,
  toCardTradeLiveByPrinting,
  toCardTradeResponse,
  toCardTradeSheetRows,
} from "../lib/card-trade-presenters.js";

const os = implement(cardTradesContract).$context<ApiContext>().use(requireAuthedUser);

/**
 * Authenticated card-trades contract (mounted at `/api/v1/trades`). The trade
 * services throw `AppError` for state failures, which are mapped by the
 * handler's appErrorInterceptor.
 */
export const cardTradesRouter = {
  create: os.create.handler(({ input, context }): Promise<CardTradeResponse> => {
    const { createTrade } = context.services;
    return createTrade(context.repos, {
      callerUserId: context.userId,
      groupSlug: input.groupSlug,
      counterpartyUserId: input.counterpartyUserId,
      role: input.role,
      printingId: input.printingId,
      quantity: input.quantity,
    });
  }),

  list: os.list.handler(async ({ input, context }): Promise<CardTradeListResponse> => {
    const { cardTrades } = context.repos;
    const rows = await cardTrades.listDtoRowsForUser(context.userId, {
      groupId: input.groupId,
      status: input.status,
    });
    return { items: rows.map((row) => toCardTradeResponse(row, context.userId)) };
  }),

  actionCounts: os.actionCounts.handler(
    async ({ context }): Promise<CardTradeActionCountsResponse> => {
      const { cardTrades } = context.repos;
      const byGroup = await cardTrades.actionNeededCountsForUser(context.userId);
      const total = byGroup.reduce((sum, entry) => sum + entry.count, 0);
      return { total, byGroup };
    },
  ),

  liveByPrinting: os.liveByPrinting.handler(
    async ({ context }): Promise<CardTradeLiveByPrintingResponse> => {
      const { cardTrades } = context.repos;
      const rows = await cardTrades.liveAnnotationsForUser(context.userId);
      return toCardTradeLiveByPrinting(rows);
    },
  ),

  withUser: os.withUser.handler(async ({ input, context }): Promise<CardTradeSheetResponse> => {
    const viewerId = context.userId;
    const counterpartyUserId = input.userId;
    if (counterpartyUserId === viewerId) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "Cannot open a trade sheet with yourself");
    }

    const { friendGroups, friendGroupMatches } = context.repos;

    // No shared group is the same answer as no such user: the viewer can see
    // nothing of either, and two different answers would turn the route into an
    // account-existence probe.
    const groups = await friendGroups.sharedGroups(viewerId, counterpartyUserId);
    const [primaryGroup] = groups;
    if (!primaryGroup) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Member not found");
    }

    // The profile is the same in every shared group, so one roster answers it;
    // revealed contacts are per group, so those are read from all of them.
    const [members, contactsByGroup] = await Promise.all([
      friendGroups.listMembers(primaryGroup.id),
      Promise.all(groups.map((group) => friendGroups.getRevealedContactsForMembers(group.id))),
    ]);
    const member = members.find((row) => row.userId === counterpartyUserId);
    if (!member) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Member not found");
    }

    // Must preserve `groups`' sorted order: it decides attribution for rows shared by several groups.
    const matchesByGroup = await Promise.all(
      groups.map(async (group) => {
        const scope = { groupId: group.id, viewerUserId: viewerId, counterpartyUserId };
        const [incoming, outgoing] = await Promise.all([
          friendGroupMatches.othersHaveYourWants(scope),
          friendGroupMatches.othersWantYourHaves(scope),
        ]);
        return { group, incoming, outgoing };
      }),
    );

    return {
      counterparty: toCardTradeCounterparty(
        {
          userId: member.userId,
          name: member.userName,
          email: member.userEmail,
          image: member.userImage,
        },
        contactsByGroup.map((contacts) => contacts.get(counterpartyUserId)),
      ),
      groups: groups.map((group) => ({ id: group.id, slug: group.slug, name: group.name })),
      othersHaveYourWants: toCardTradeSheetRows(
        matchesByGroup.map(({ group, incoming }) => ({ group, rows: incoming })),
      ),
      othersWantYourHaves: toCardTradeSheetRows(
        matchesByGroup.map(({ group, outgoing }) => ({ group, rows: outgoing })),
      ),
    };
  }),

  copyOptions: os.copyOptions.handler(
    ({ input, context }): Promise<CardTradeCopyOptionsResponse> => {
      const { listTradeCopyOptions } = context.services;
      return listTradeCopyOptions(context.repos, input.id, context.userId);
    },
  ),

  accept: os.accept.handler(({ input, context }): Promise<CardTradeResponse> => {
    const { acceptTrade } = context.services;
    return acceptTrade(context.transact, input.id, context.userId, input.copyIds);
  }),

  decline: os.decline.handler(({ input, context }): Promise<CardTradeResponse> => {
    const { declineTrade } = context.services;
    return declineTrade(context.transact, input.id, context.userId);
  }),

  cancel: os.cancel.handler(({ input, context }): Promise<CardTradeResponse> => {
    const { cancelTrade } = context.services;
    return cancelTrade(context.transact, input.id, context.userId);
  }),

  setQuantity: os.setQuantity.handler(({ input, context }): Promise<CardTradeResponse> => {
    const { setTradeQuantity } = context.services;
    return setTradeQuantity(context.transact, input.id, context.userId, input.quantity);
  }),

  sync: os.sync.handler(({ input, context }): Promise<CardTradeResponse> => {
    const { applyTradeSync } = context.services;
    return applyTradeSync(context.transact, input.id, context.userId, {
      targetCollectionId: input.targetCollectionId,
      copyIds: input.copyIds,
      quantity: input.quantity,
    });
  }),

  skipSync: os.skipSync.handler(({ input, context }): Promise<CardTradeResponse> => {
    const { skipTradeSync } = context.services;
    return skipTradeSync(context.transact, input.id, context.userId, {
      quantity: input.quantity,
    });
  }),
};
