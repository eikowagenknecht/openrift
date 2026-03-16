import { zValidator } from "@hono/zod-validator";
import { formatDateUTC } from "@openrift/shared";
import type { Activity, ActivityType } from "@openrift/shared";
import { activitiesQuerySchema, idParamSchema } from "@openrift/shared/schemas";
import { Hono } from "hono";

import { AppError } from "../errors.js";
import { getUserId } from "../middleware/get-user-id.js";
import { requireAuth } from "../middleware/require-auth.js";
import { activitiesRepo } from "../repositories/activities.js";
import type { Variables } from "../types.js";

export const activitiesRoute = new Hono<{ Variables: Variables }>()
  .use("/activities/*", requireAuth)
  .use("/activities", requireAuth)

  // ── GET /activities ───────────────────────────────────────────────────────────

  .get("/activities", zValidator("query", activitiesQuerySchema), async (c) => {
    const activities = activitiesRepo(c.get("db"));
    const userId = getUserId(c);
    const { cursor, limit: rawLimit } = c.req.valid("query");
    const limit = rawLimit ?? 50;

    const rows = await activities.listForUser(userId, limit, cursor);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);

    const mapped: Activity[] = items.map((row) => ({
      id: row.id,
      type: row.type as ActivityType,
      name: row.name,
      date: formatDateUTC(row.date),
      description: row.description,
      isAuto: row.isAuto,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));

    return c.json({
      activities: mapped,
      nextCursor: hasMore ? (items.at(-1)?.createdAt.toISOString() ?? null) : null,
    });
  })

  // ── GET /activities/:id ───────────────────────────────────────────────────────

  .get("/activities/:id", zValidator("param", idParamSchema), async (c) => {
    const repo = activitiesRepo(c.get("db"));
    const userId = getUserId(c);
    const { id } = c.req.valid("param");

    const activity = await repo.getByIdForUser(id, userId);
    if (!activity) {
      throw new AppError(404, "NOT_FOUND", "Not found");
    }

    const itemRows = await repo.itemsWithDetails(id);

    const items = itemRows.map((row) => ({
      id: row.id,
      activityId: row.activityId,
      activityType: row.activityType,
      copyId: row.copyId,
      printingId: row.printingId,
      action: row.action,
      fromCollectionId: row.fromCollectionId,
      fromCollectionName: row.fromCollectionName,
      toCollectionId: row.toCollectionId,
      toCollectionName: row.toCollectionName,
      metadataSnapshot: row.metadataSnapshot,
      createdAt: row.createdAt.toISOString(),
      cardName: row.cardName,
      cardType: row.cardType,
      imageUrl: row.imageUrl,
      setId: row.setId,
      collectorNumber: row.collectorNumber,
      rarity: row.rarity,
    }));

    return c.json({
      activity: {
        id: activity.id,
        type: activity.type,
        name: activity.name,
        date: formatDateUTC(activity.date),
        description: activity.description,
        isAuto: activity.isAuto,
        createdAt: activity.createdAt.toISOString(),
        updatedAt: activity.updatedAt.toISOString(),
      },
      items,
    });
  });
