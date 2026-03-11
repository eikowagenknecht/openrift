import { addCopiesSchema, disposeCopiesSchema, moveCopiesSchema } from "@openrift/shared/schemas";
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
import { createActivity } from "../services/activity-logger.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { ensureInbox } from "../services/inbox.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import type { Variables } from "../types.js";

export const copiesRoute = new Hono<{ Variables: Variables }>();

copiesRoute.use("/copies/*", requireAuth);
copiesRoute.use("/copies", requireAuth);

// ── GET /copies ───────────────────────────────────────────────────────────────
// All copies for the authenticated user (combined view)

copiesRoute.get("/copies", async (c) => {
  const userId = getUserId(c);

  const copies = await db
    .selectFrom("copies as cp")
    .innerJoin("printings as p", "p.id", "cp.printing_id")
    .innerJoin("cards as card", "card.id", "p.card_id")
    .leftJoin("printing_images as pi", (join) =>
      join
        .onRef("pi.printing_id", "=", "p.id")
        .on("pi.face", "=", "front")
        .on("pi.is_active", "=", true),
    )
    .select([
      "cp.id",
      "cp.printing_id",
      "cp.collection_id",
      "cp.source_id",
      "cp.created_at",
      "cp.updated_at",
      "p.card_id",
      "p.set_id",
      "p.collector_number",
      "p.rarity",
      "p.art_variant",
      "p.is_signed",
      "p.is_promo",
      "p.finish",
      imageUrl("pi").as("image_url"),
      "p.artist",
      "card.name as card_name",
      "card.type as card_type",
    ])
    .where("cp.user_id", "=", userId)
    .orderBy("card.name")
    .orderBy("p.collector_number")
    .execute();

  return c.json(copies);
});

// ── POST /copies ──────────────────────────────────────────────────────────────
// Batch add copies (acquisition)

copiesRoute.post("/copies", async (c) => {
  const userId = getUserId(c);
  const body = addCopiesSchema.parse(await c.req.json());

  const inboxId = await ensureInbox(db, userId);

  const created = await db.transaction().execute(async (trx) => {
    const copyRows = body.copies.map((item) => ({
      id: crypto.randomUUID(),
      user_id: userId,
      printing_id: item.printingId,
      collection_id: item.collectionId ?? inboxId,
      source_id: item.sourceId ?? null,
    }));

    await trx.insertInto("copies").values(copyRows).execute();

    // Look up collection names for activity items
    const collectionIds = [...new Set(copyRows.map((r) => r.collection_id))];
    const collections = await trx
      .selectFrom("collections")
      .select(["id", "name"])
      .where("id", "in", collectionIds)
      .execute();
    const collectionNames = new Map(collections.map((col) => [col.id, col.name]));

    await createActivity(trx, {
      userId,
      type: "acquisition",
      isAuto: true,
      items: copyRows.map((row) => ({
        copyId: row.id,
        printingId: row.printing_id,
        action: "added" as const,
        toCollectionId: row.collection_id,
        toCollectionName: collectionNames.get(row.collection_id) ?? null,
      })),
    });

    return copyRows;
  });

  return c.json(
    created.map((r) => ({
      id: r.id,
      printingId: r.printing_id,
      collectionId: r.collection_id,
      sourceId: r.source_id,
    })),
    201,
  );
});

// ── POST /copies/move ─────────────────────────────────────────────────────────
// Move copies between collections (reorganization)

copiesRoute.post("/copies/move", async (c) => {
  const userId = getUserId(c);
  const body = moveCopiesSchema.parse(await c.req.json());

  // Verify target collection belongs to user
  const target = await db
    .selectFrom("collections")
    .select(["id", "name"])
    .where("id", "=", body.toCollectionId)
    .where("user_id", "=", userId)
    .executeTakeFirst();

  if (!target) {
    throw new AppError(404, "NOT_FOUND", "Target collection not found");
  }

  await db.transaction().execute(async (trx) => {
    // Fetch copies with their current collection info
    const copies = await trx
      .selectFrom("copies as cp")
      .innerJoin("collections as col", "col.id", "cp.collection_id")
      .select(["cp.id", "cp.printing_id", "cp.collection_id", "col.name as collection_name"])
      .where("cp.id", "in", body.copyIds)
      .where("cp.user_id", "=", userId)
      .execute();

    if (copies.length === 0) {
      return;
    }

    // Update copies
    await trx
      .updateTable("copies")
      .set({ collection_id: body.toCollectionId, updated_at: new Date() })
      .where(
        "id",
        "in",
        copies.map((row) => row.id),
      )
      .where("user_id", "=", userId)
      .execute();

    // Log reorganization activity
    await createActivity(trx, {
      userId,
      type: "reorganization",
      isAuto: true,
      items: copies.map((copy) => ({
        copyId: copy.id,
        printingId: copy.printing_id,
        action: "moved" as const,
        fromCollectionId: copy.collection_id,
        fromCollectionName: copy.collection_name,
        toCollectionId: target.id,
        toCollectionName: target.name,
      })),
    });
  });

  return c.json({ ok: true });
});

// ── POST /copies/dispose ──────────────────────────────────────────────────────
// Dispose copies (disposal) — hard-deletes with metadata snapshot

copiesRoute.post("/copies/dispose", async (c) => {
  const userId = getUserId(c);
  const body = disposeCopiesSchema.parse(await c.req.json());

  await db.transaction().execute(async (trx) => {
    // Fetch copies with collection info for snapshots
    const copies = await trx
      .selectFrom("copies as cp")
      .innerJoin("collections as col", "col.id", "cp.collection_id")
      .select([
        "cp.id",
        "cp.printing_id",
        "cp.collection_id",
        "cp.source_id",
        "col.name as collection_name",
      ])
      .where("cp.id", "in", body.copyIds)
      .where("cp.user_id", "=", userId)
      .execute();

    if (copies.length === 0) {
      return;
    }

    // Log disposal activity before deleting (so copy FK is still valid)
    await createActivity(trx, {
      userId,
      type: "disposal",
      isAuto: true,
      items: copies.map((copy) => ({
        copyId: copy.id,
        printingId: copy.printing_id,
        action: "removed" as const,
        fromCollectionId: copy.collection_id,
        fromCollectionName: copy.collection_name,
        metadataSnapshot: {
          copyId: copy.id,
          sourceId: copy.source_id,
        },
      })),
    });

    // Hard-delete copies (activity_items.copy_id → SET NULL via FK)
    await trx
      .deleteFrom("copies")
      .where(
        "id",
        "in",
        copies.map((row) => row.id),
      )
      .where("user_id", "=", userId)
      .execute();
  });

  return c.json({ ok: true });
});

// ── GET /copies/count ─────────────────────────────────────────────────────────
// Returns owned count per printing for the authenticated user

copiesRoute.get("/copies/count", async (c) => {
  const userId = getUserId(c);

  const rows = await db
    .selectFrom("copies")
    .select(["printing_id", db.fn.count<number>("id").as("count")])
    .where("user_id", "=", userId)
    .groupBy("printing_id")
    .execute();

  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.printing_id] = Number(row.count);
  }

  return c.json(counts);
});

// ── GET /copies/:id ───────────────────────────────────────────────────────────

copiesRoute.get("/copies/:id", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");

  const copy = await db
    .selectFrom("copies as cp")
    .innerJoin("printings as p", "p.id", "cp.printing_id")
    .innerJoin("cards as card", "card.id", "p.card_id")
    .leftJoin("printing_images as pi", (join) =>
      join
        .onRef("pi.printing_id", "=", "p.id")
        .on("pi.face", "=", "front")
        .on("pi.is_active", "=", true),
    )
    .select([
      "cp.id",
      "cp.printing_id",
      "cp.collection_id",
      "cp.source_id",
      "cp.created_at",
      "cp.updated_at",
      "p.card_id",
      "p.set_id",
      "p.collector_number",
      "p.rarity",
      imageUrl("pi").as("image_url"),
      "card.name as card_name",
      "card.type as card_type",
    ])
    .where("cp.id", "=", id)
    .where("cp.user_id", "=", userId)
    .executeTakeFirst();

  if (!copy) {
    throw new AppError(404, "NOT_FOUND", "Not found");
  }

  return c.json(copy);
});
