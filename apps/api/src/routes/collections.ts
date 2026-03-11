import type { Collection } from "@openrift/shared";
import { createCollectionSchema, updateCollectionSchema } from "@openrift/shared/schemas";
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

export const collectionsRoute = new Hono<{ Variables: Variables }>();

collectionsRoute.use("/collections/*", requireAuth);
collectionsRoute.use("/collections", requireAuth);

function toCollection(row: {
  id: string;
  name: string;
  description: string | null;
  available_for_deckbuilding: boolean;
  is_inbox: boolean;
  sort_order: number;
  share_token: string | null;
  created_at: Date;
  updated_at: Date;
}): Collection {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    availableForDeckbuilding: row.available_for_deckbuilding,
    isInbox: row.is_inbox,
    sortOrder: row.sort_order,
    shareToken: row.share_token,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

// ── GET /collections ──────────────────────────────────────────────────────────

collectionsRoute.get("/collections", async (c) => {
  const userId = getUserId(c);

  // Ensure inbox exists
  await ensureInbox(db, userId);

  const rows = await db
    .selectFrom("collections")
    .selectAll()
    .where("user_id", "=", userId)
    .orderBy("is_inbox", "desc")
    .orderBy("sort_order")
    .orderBy("name")
    .execute();

  return c.json(rows.map((row) => toCollection(row)));
});

// ── POST /collections ─────────────────────────────────────────────────────────

collectionsRoute.post("/collections", async (c) => {
  const userId = getUserId(c);
  const body = createCollectionSchema.parse(await c.req.json());

  const id = crypto.randomUUID();
  const row = await db
    .insertInto("collections")
    .values({
      id,
      user_id: userId,
      name: body.name,
      description: body.description ?? null,
      available_for_deckbuilding: body.availableForDeckbuilding ?? true,
      is_inbox: false,
      sort_order: 0,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  return c.json(toCollection(row), 201);
});

// ── GET /collections/:id ──────────────────────────────────────────────────────

collectionsRoute.get("/collections/:id", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");

  const row = await db
    .selectFrom("collections")
    .selectAll()
    .where("id", "=", id)
    .where("user_id", "=", userId)
    .executeTakeFirst();

  if (!row) {
    throw new AppError(404, "NOT_FOUND", "Not found");
  }

  return c.json(toCollection(row));
});

// ── PATCH /collections/:id ────────────────────────────────────────────────────

collectionsRoute.patch("/collections/:id", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const body = updateCollectionSchema.parse(await c.req.json());

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) {
    updates.name = body.name;
  }
  if (body.description !== undefined) {
    updates.description = body.description;
  }
  if (body.availableForDeckbuilding !== undefined) {
    updates.available_for_deckbuilding = body.availableForDeckbuilding;
  }
  if (body.sortOrder !== undefined) {
    updates.sort_order = body.sortOrder;
  }

  if (Object.keys(updates).length === 0) {
    throw new AppError(400, "BAD_REQUEST", "No fields to update");
  }

  updates.updated_at = new Date();

  const row = await db
    .updateTable("collections")
    .set(updates)
    .where("id", "=", id)
    .where("user_id", "=", userId)
    .returningAll()
    .executeTakeFirst();

  if (!row) {
    throw new AppError(404, "NOT_FOUND", "Not found");
  }

  return c.json(toCollection(row));
});

// ── DELETE /collections/:id ───────────────────────────────────────────────────

collectionsRoute.delete("/collections/:id", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const moveCopiesTo = c.req.query("move_copies_to");

  const collection = await db
    .selectFrom("collections")
    .selectAll()
    .where("id", "=", id)
    .where("user_id", "=", userId)
    .executeTakeFirst();

  if (!collection) {
    throw new AppError(404, "NOT_FOUND", "Not found");
  }

  if (collection.is_inbox) {
    throw new AppError(400, "BAD_REQUEST", "Cannot delete inbox collection");
  }

  if (!moveCopiesTo) {
    throw new AppError(400, "BAD_REQUEST", "move_copies_to query parameter is required");
  }

  if (moveCopiesTo === id) {
    throw new AppError(400, "BAD_REQUEST", "Cannot move copies to the same collection");
  }

  // Verify target collection exists and belongs to user
  const target = await db
    .selectFrom("collections")
    .select(["id", "name"])
    .where("id", "=", moveCopiesTo)
    .where("user_id", "=", userId)
    .executeTakeFirst();

  if (!target) {
    throw new AppError(404, "NOT_FOUND", "Target collection not found");
  }

  await db.transaction().execute(async (trx) => {
    // Get copies to move
    const copies = await trx
      .selectFrom("copies")
      .select(["id", "printing_id"])
      .where("collection_id", "=", id)
      .execute();

    if (copies.length > 0) {
      // Move all copies to target
      await trx
        .updateTable("copies")
        .set({ collection_id: moveCopiesTo, updated_at: new Date() })
        .where("collection_id", "=", id)
        .execute();

      // Log reorganization activity
      await createActivity(trx, {
        userId,
        type: "reorganization",
        name: `Moved cards from deleted collection "${collection.name}"`,
        isAuto: true,
        items: copies.map((copy) => ({
          copyId: copy.id,
          printingId: copy.printing_id,
          action: "moved" as const,
          fromCollectionId: id,
          fromCollectionName: collection.name,
          toCollectionId: moveCopiesTo,
          toCollectionName: target.name,
        })),
      });
    }

    // Now delete the empty collection
    await trx
      .deleteFrom("collections")
      .where("id", "=", id)
      .where("user_id", "=", userId)
      .execute();
  });

  return c.json({ ok: true });
});

// ── GET /collections/:id/copies ───────────────────────────────────────────────

collectionsRoute.get("/collections/:id/copies", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");

  // Verify collection belongs to user
  const collection = await db
    .selectFrom("collections")
    .select("id")
    .where("id", "=", id)
    .where("user_id", "=", userId)
    .executeTakeFirst();

  if (!collection) {
    throw new AppError(404, "NOT_FOUND", "Not found");
  }

  const copies = await db
    .selectFrom("copies as cp")
    .innerJoin("printings as p", "p.id", "cp.printing_id")
    .innerJoin("cards as c", "c.id", "p.card_id")
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
      "c.name as card_name",
      "c.type as card_type",
    ])
    .where("cp.collection_id", "=", id)
    .orderBy("c.name")
    .orderBy("p.collector_number")
    .execute();

  return c.json(copies);
});
