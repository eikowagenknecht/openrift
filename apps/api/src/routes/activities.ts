import { zValidator } from "@hono/zod-validator";
import { activitiesQuerySchema, idParamSchema } from "@openrift/shared/schemas";
import { Hono } from "hono";

import { AppError } from "../errors.js";
import { getUserId } from "../middleware/get-user-id.js";
import { requireAuth } from "../middleware/require-auth.js";
import { activitiesRepo } from "../repositories/activities.js";
import type { Variables } from "../types.js";
import { toActivity } from "../utils/mappers.js";

export const activitiesRoute = new Hono<{ Variables: Variables }>()
  .basePath("/activities")
  .use(requireAuth)

  // ── GET /activities ───────────────────────────────────────────────────────────

  .get("/", zValidator("query", activitiesQuerySchema), async (c) => {
    const repo = activitiesRepo(c.get("db"));
    const userId = getUserId(c);
    const { cursor, limit: rawLimit } = c.req.valid("query");
    const limit = rawLimit ?? 50;

    const rows = await repo.listForUser(userId, limit, cursor);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);

    return c.json({
      activities: items.map((r) => toActivity(r)),
      nextCursor: hasMore ? (items.at(-1)?.createdAt.toISOString() ?? null) : null,
    });
  })

  // ── GET /activities/:id ───────────────────────────────────────────────────────

  .get("/:id", zValidator("param", idParamSchema), async (c) => {
    const repo = activitiesRepo(c.get("db"));
    const userId = getUserId(c);
    const { id } = c.req.valid("param");

    const activity = await repo.getByIdForUser(id, userId);
    if (!activity) {
      throw new AppError(404, "NOT_FOUND", "Not found");
    }

    const itemRows = await repo.itemsWithDetails(id, userId);

    return c.json({
      activity: toActivity(activity),
      items: itemRows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  });
