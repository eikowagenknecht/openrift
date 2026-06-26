import type {
  CardTradeActionCountsResponse,
  CardTradeListResponse,
  CardTradeResponse,
} from "@openrift/shared";
import { cardTradesContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import { requireUserId } from "../../middleware/get-user-id.js";
import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(cardTradesContract).$context<ApiContext>().use(requireUser);

/**
 * Authenticated card-trades contract (mounted at `/api/v1/trades`). The trade
 * services throw `AppError` for state failures, which are mapped by the
 * handler's appErrorInterceptor.
 */
export const cardTradesRouter = {
  create: os.create.handler(({ input, context }): Promise<CardTradeResponse> => {
    const { createTrade } = context.services;
    return createTrade(context.repos, {
      callerUserId: requireUserId(context.user),
      groupSlug: input.groupSlug,
      counterpartyUserId: input.counterpartyUserId,
      role: input.role,
      printingId: input.printingId,
      quantity: input.quantity,
    });
  }),

  list: os.list.handler(async ({ input, context }): Promise<CardTradeListResponse> => {
    const { cardTrades } = context.repos;
    const items = await cardTrades.listForUser(requireUserId(context.user), {
      groupId: input.groupId,
      status: input.status,
    });
    return { items };
  }),

  actionCounts: os.actionCounts.handler(
    async ({ context }): Promise<CardTradeActionCountsResponse> => {
      const { cardTrades } = context.repos;
      const byGroup = await cardTrades.actionNeededCountsForUser(requireUserId(context.user));
      const total = byGroup.reduce((sum, entry) => sum + entry.count, 0);
      return { total, byGroup };
    },
  ),

  accept: os.accept.handler(({ input, context }): Promise<CardTradeResponse> => {
    const { acceptTrade } = context.services;
    return acceptTrade(context.transact, input.id, requireUserId(context.user));
  }),

  decline: os.decline.handler(({ input, context }): Promise<CardTradeResponse> => {
    const { declineTrade } = context.services;
    return declineTrade(context.transact, input.id, requireUserId(context.user));
  }),

  cancel: os.cancel.handler(({ input, context }): Promise<CardTradeResponse> => {
    const { cancelTrade } = context.services;
    return cancelTrade(context.transact, input.id, requireUserId(context.user));
  }),

  complete: os.complete.handler(({ input, context }): Promise<CardTradeResponse> => {
    const { completeTrade } = context.services;
    return completeTrade(context.transact, input.id, requireUserId(context.user));
  }),

  setQuantity: os.setQuantity.handler(({ input, context }): Promise<CardTradeResponse> => {
    const { setTradeQuantity } = context.services;
    return setTradeQuantity(
      context.transact,
      input.id,
      requireUserId(context.user),
      input.quantity,
    );
  }),

  sync: os.sync.handler(({ input, context }): Promise<CardTradeResponse> => {
    const { applyTradeSync } = context.services;
    return applyTradeSync(
      context.transact,
      input.id,
      requireUserId(context.user),
      input.targetCollectionId,
    );
  }),

  skipSync: os.skipSync.handler(({ input, context }): Promise<CardTradeResponse> => {
    const { skipTradeSync } = context.services;
    return skipTradeSync(context.transact, input.id, requireUserId(context.user));
  }),
};
