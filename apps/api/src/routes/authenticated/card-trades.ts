import type {
  CardTradeActionCountsResponse,
  CardTradeCopyOptionsResponse,
  CardTradeListResponse,
  CardTradeLiveByPrintingResponse,
  CardTradeResponse,
} from "@openrift/shared";
import { cardTradesContract } from "@openrift/shared/contracts/card-trades";
import { implement } from "@orpc/server";

import { toCardTradeLiveByPrinting } from "../../lib/card-trade-presenters.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

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
    const items = await cardTrades.listForUser(context.userId, {
      groupId: input.groupId,
      status: input.status,
    });
    return { items };
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
    return applyTradeSync(context.transact, input.id, context.userId, input.targetCollectionId);
  }),

  skipSync: os.skipSync.handler(({ input, context }): Promise<CardTradeResponse> => {
    const { skipTradeSync } = context.services;
    return skipTradeSync(context.transact, input.id, context.userId);
  }),
};
