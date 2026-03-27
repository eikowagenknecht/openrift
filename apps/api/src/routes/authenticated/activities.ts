import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { ActivityDetailResponse, ActivityListResponse } from "@openrift/shared";
import {
  activityDetailResponseSchema,
  activityListResponseSchema,
} from "@openrift/shared/response-schemas";
import { activitiesQuerySchema, idParamSchema } from "@openrift/shared/schemas";

import { AppError } from "../../errors.js";
import { getUserId } from "../../middleware/get-user-id.js";
import { requireAuth } from "../../middleware/require-auth.js";
import type { Variables } from "../../types.js";
import { toActivity, toActivityItem } from "../../utils/mappers.js";

const listActivities = createRoute({
  method: "get",
  path: "/",
  tags: ["Activities"],
  request: { query: activitiesQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: activityListResponseSchema } },
      description: "Success",
    },
  },
});

const getActivity = createRoute({
  method: "get",
  path: "/{id}",
  tags: ["Activities"],
  request: { params: idParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: activityDetailResponseSchema } },
      description: "Success",
    },
  },
});

const activitiesApp = new OpenAPIHono<{ Variables: Variables }>().basePath("/activities");
activitiesApp.use(requireAuth);
export const activitiesRoute = activitiesApp
  // ── GET /activities ───────────────────────────────────────────────────────────

  .openapi(listActivities, async (c) => {
    const { activities } = c.get("repos");
    const userId = getUserId(c);
    const { cursor, limit: rawLimit } = c.req.valid("query");
    const limit = rawLimit ?? 50;

    const rows = await activities.listForUser(userId, limit, cursor);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);

    const result: ActivityListResponse = {
      items: items.map((r) => toActivity(r)),
      nextCursor: hasMore ? (items.at(-1)?.createdAt.toISOString() ?? null) : null,
    };
    return c.json(result);
  })

  // ── GET /activities/:id ───────────────────────────────────────────────────────

  .openapi(getActivity, async (c) => {
    const { activities } = c.get("repos");
    const userId = getUserId(c);
    const { id } = c.req.valid("param");

    const activity = await activities.getByIdForUser(id, userId);
    if (!activity) {
      throw new AppError(404, "NOT_FOUND", "Not found");
    }

    const itemRows = await activities.itemsWithDetails(id, userId);

    const detail: ActivityDetailResponse = {
      activity: toActivity(activity),
      items: itemRows.map((row) => toActivityItem(row)),
    };
    return c.json(detail);
  });
