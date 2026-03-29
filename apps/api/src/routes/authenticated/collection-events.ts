import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { CollectionEventListResponse } from "@openrift/shared";
import { collectionEventListResponseSchema } from "@openrift/shared/response-schemas";
import { collectionEventsQuerySchema } from "@openrift/shared/schemas";

import { getUserId } from "../../middleware/get-user-id.js";
import { requireAuth } from "../../middleware/require-auth.js";
import type { Variables } from "../../types.js";
import { toCollectionEvent } from "../../utils/mappers.js";

const listEvents = createRoute({
  method: "get",
  path: "/",
  tags: ["Collection Events"],
  request: { query: collectionEventsQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: collectionEventListResponseSchema } },
      description: "Success",
    },
  },
});

const collectionEventsApp = new OpenAPIHono<{ Variables: Variables }>().basePath(
  "/collection-events",
);
collectionEventsApp.use(requireAuth);
export const collectionEventsRoute = collectionEventsApp.openapi(listEvents, async (c) => {
  const { collectionEvents } = c.get("repos");
  const userId = getUserId(c);
  const { cursor, limit: rawLimit } = c.req.valid("query");
  const limit = rawLimit ?? 50;

  const rows = await collectionEvents.listForUser(userId, limit, cursor);

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);

  const result: CollectionEventListResponse = {
    items: items.map((r) => toCollectionEvent(r)),
    nextCursor: hasMore ? (items.at(-1)?.createdAt.toISOString() ?? null) : null,
  };
  return c.json(result);
});
