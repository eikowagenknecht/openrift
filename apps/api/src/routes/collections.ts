import { zValidator } from "@hono/zod-validator";
import {
  createCollectionSchema,
  idParamSchema,
  updateCollectionSchema,
} from "@openrift/shared/schemas";
import { Hono } from "hono";

import { imageUrl, selectCopyWithCard } from "../db-helpers.js";
import { db } from "../db.js";
import { AppError } from "../errors.js";
import { getUserId } from "../middleware/get-user-id.js";
import { requireAuth } from "../middleware/require-auth.js";
import { buildPatchUpdates } from "../patch.js";
import type { FieldMapping } from "../patch.js";
import { createActivity } from "../services/activity-logger.js";
import { ensureInbox } from "../services/inbox.js";
import type { Variables } from "../types.js";
import { toCollection, toCopy } from "../utils/dto.js";

const patchFields: FieldMapping = {
  name: "name",
  description: "description",
  availableForDeckbuilding: "available_for_deckbuilding",
  sortOrder: "sort_order",
};

export const collectionsRoute = new Hono<{ Variables: Variables }>()
  .use("/collections/*", requireAuth)
  .use("/collections", requireAuth)

  // ── LIST ────────────────────────────────────────────────────────────────────
  .get("/collections", async (c) => {
    await ensureInbox(db, getUserId(c));
    const userId = getUserId(c);
    const rows = await db
      .selectFrom("collections")
      .selectAll()
      .where("user_id", "=", userId)
      .orderBy("is_inbox", "desc")
      .orderBy("sort_order")
      .orderBy("name")
      .execute();
    return c.json(rows.map((row) => toCollection(row)));
  })

  // ── CREATE ──────────────────────────────────────────────────────────────────
  .post("/collections", zValidator("json", createCollectionSchema), async (c) => {
    const userId = getUserId(c);
    const body = c.req.valid("json");
    const row = await db
      .insertInto("collections")
      .values({
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
  })

  // ── GET ONE ─────────────────────────────────────────────────────────────────
  .get("/collections/:id", zValidator("param", idParamSchema), async (c) => {
    const userId = getUserId(c);
    const { id } = c.req.valid("param");
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
  })

  // ── UPDATE ──────────────────────────────────────────────────────────────────
  .patch(
    "/collections/:id",
    zValidator("param", idParamSchema),
    zValidator("json", updateCollectionSchema),
    async (c) => {
      const userId = getUserId(c);
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const updates = buildPatchUpdates(body, patchFields);
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
    },
  )

  // ── DELETE /collections/:id ─────────────────────────────────────────────────
  // Complex: validates inbox, relocates copies, logs activity
  .delete("/collections/:id", zValidator("param", idParamSchema), async (c) => {
    const userId = getUserId(c);
    const { id } = c.req.valid("param");
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
  })

  // ── GET /collections/:id/copies ─────────────────────────────────────────────
  .get("/collections/:id/copies", zValidator("param", idParamSchema), async (c) => {
    const userId = getUserId(c);
    const { id } = c.req.valid("param");

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

    const copies = await selectCopyWithCard(db)
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

    return c.json(copies.map((row) => toCopy(row)));
  });
