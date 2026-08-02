import type { CollectionEventListResponse } from "@openrift/shared";
import { collectionEventsContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import { toCollectionEvent } from "../../lib/collection-presenters.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import { buildKeysetCursor } from "../../repositories/query-helpers.js";

const os = implement(collectionEventsContract).$context<ApiContext>().use(requireAuthedUser);

export const collectionEventsRouter = {
  list: os.list.handler(async ({ input, context }): Promise<CollectionEventListResponse> => {
    const { collectionEvents } = context.repos;
    const userId = context.userId;
    const limit = input.limit ?? 100;

    const rows = await collectionEvents.listForUser(userId, limit, input.cursor);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    const lastItem = items.at(-1);
    return {
      items: items.map((r) => toCollectionEvent(r)),
      nextCursor: hasMore && lastItem ? buildKeysetCursor(lastItem.createdAt, lastItem.id) : null,
    };
  }),
};
