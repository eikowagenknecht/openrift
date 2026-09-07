import { collectionEventsContract } from "@openrift/shared/contracts/collection-events";
import type { CollectionEventListResponse } from "@openrift/shared/types/api/collection-event";
import { implement } from "@orpc/server";

import { toCollectionEvent } from "../../lib/collection-presenters.js";
import { keysetPage } from "../../lib/keyset-cursor.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(collectionEventsContract).$context<ApiContext>().use(requireAuthedUser);

export const collectionEventsRouter = {
  list: os.list.handler(async ({ input, context }): Promise<CollectionEventListResponse> => {
    const { collectionEvents } = context.repos;
    const userId = context.userId;
    const limit = input.limit ?? 100;

    const rows = await collectionEvents.listForUser(userId, limit, input.cursor);

    return keysetPage(rows, limit, toCollectionEvent);
  }),
};
