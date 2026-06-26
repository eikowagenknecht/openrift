import type { CollectionEventListResponse } from "@openrift/shared";
import { collectionEventsContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import { requireUserId } from "../../middleware/get-user-id.js";
import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import { buildEventsCursor } from "../../repositories/collection-events.js";
import { toCollectionEvent } from "../../utils/mappers.js";

const os = implement(collectionEventsContract).$context<ApiContext>().use(requireUser);

/**
 * oRPC implementation of the authenticated collection-events contract. Logic
 * unchanged from the previous handler; only the routing layer moved.
 */
export const collectionEventsRouter = {
  list: os.list.handler(async ({ input, context }): Promise<CollectionEventListResponse> => {
    const { collectionEvents } = context.repos;
    const userId = requireUserId(context.user);
    const limit = input.limit ?? 100;

    const rows = await collectionEvents.listForUser(userId, limit, input.cursor);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    const lastItem = items.at(-1);
    return {
      items: items.map((r) => toCollectionEvent(r)),
      nextCursor: hasMore && lastItem ? buildEventsCursor(lastItem.createdAt, lastItem.id) : null,
    };
  }),
};
