import type { Activity, ActivityType } from "@openrift/shared";
import { Hono } from "hono";

// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { imageUrl } from "../db-helpers.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { db } from "../db.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { AppError } from "../errors.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { getUserId } from "../middleware/get-user-id.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { requireAuth } from "../middleware/require-auth.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import type { Variables } from "../types.js";

export const activitiesRoute = new Hono<{ Variables: Variables }>();

activitiesRoute.use("/activities/*", requireAuth);
activitiesRoute.use("/activities", requireAuth);

// ── GET /activities ───────────────────────────────────────────────────────────

activitiesRoute.get("/activities", async (c) => {
  const userId = getUserId(c);
  const cursor = c.req.query("cursor");
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 100);

  let query = db
    .selectFrom("activities")
    .selectAll()
    .where("user_id", "=", userId)
    .orderBy("created_at", "desc")
    .limit(limit + 1);

  if (cursor) {
    query = query.where("created_at", "<", new Date(cursor));
  }

  const rows = await query.execute();

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);

  const activities: Activity[] = items.map((row) => ({
    id: row.id,
    type: row.type as ActivityType,
    name: row.name,
    date: row.date instanceof Date ? row.date.toISOString().split("T")[0] : String(row.date),
    description: row.description,
    isAuto: row.is_auto,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }));

  return c.json({
    activities,
    nextCursor: hasMore ? (items.at(-1)?.created_at.toISOString() ?? null) : null,
  });
});

// ── GET /activities/:id ───────────────────────────────────────────────────────

activitiesRoute.get("/activities/:id", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");

  const activity = await db
    .selectFrom("activities")
    .selectAll()
    .where("id", "=", id)
    .where("user_id", "=", userId)
    .executeTakeFirst();

  if (!activity) {
    throw new AppError(404, "NOT_FOUND", "Not found");
  }

  const itemRows = await db
    .selectFrom("activity_items as ai")
    .innerJoin("printings as p", "p.id", "ai.printing_id")
    .innerJoin("cards as card", "card.id", "p.card_id")
    .leftJoin("printing_images as pi", (join) =>
      join
        .onRef("pi.printing_id", "=", "p.id")
        .on("pi.face", "=", "front")
        .on("pi.is_active", "=", true),
    )
    .select([
      "ai.id",
      "ai.activity_id",
      "ai.activity_type",
      "ai.copy_id",
      "ai.printing_id",
      "ai.action",
      "ai.from_collection_id",
      "ai.from_collection_name",
      "ai.to_collection_id",
      "ai.to_collection_name",
      "ai.metadata_snapshot",
      "ai.created_at",
      imageUrl("pi").as("image_url"),
      "p.set_id",
      "p.collector_number",
      "p.rarity",
      "card.name as card_name",
      "card.type as card_type",
    ])
    .where("ai.activity_id", "=", id)
    .orderBy("ai.created_at")
    .execute();

  const items = itemRows.map((row) => ({
    id: row.id,
    activityId: row.activity_id,
    activityType: row.activity_type,
    copyId: row.copy_id,
    printingId: row.printing_id,
    action: row.action,
    fromCollectionId: row.from_collection_id,
    fromCollectionName: row.from_collection_name,
    toCollectionId: row.to_collection_id,
    toCollectionName: row.to_collection_name,
    metadataSnapshot: row.metadata_snapshot,
    createdAt: row.created_at.toISOString(),
    cardName: row.card_name,
    cardType: row.card_type,
    imageUrl: row.image_url,
    setId: row.set_id,
    collectorNumber: row.collector_number,
    rarity: row.rarity,
  }));

  return c.json({
    activity: {
      id: activity.id,
      type: activity.type,
      name: activity.name,
      date:
        activity.date instanceof Date
          ? activity.date.toISOString().split("T")[0]
          : String(activity.date),
      description: activity.description,
      isAuto: activity.is_auto,
      createdAt: activity.created_at.toISOString(),
      updatedAt: activity.updated_at.toISOString(),
    },
    items,
  });
});
