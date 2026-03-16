import { zValidator } from "@hono/zod-validator";
import {
  createCollectionSchema,
  idParamSchema,
  updateCollectionSchema,
} from "@openrift/shared/schemas";
import { Hono } from "hono";

import { AppError } from "../errors.js";
import { getUserId } from "../middleware/get-user-id.js";
import { requireAuth } from "../middleware/require-auth.js";
import { buildPatchUpdates } from "../patch.js";
import type { FieldMapping } from "../patch.js";
import { collectionsRepo } from "../repositories/collections.js";
import { copiesRepo } from "../repositories/copies.js";
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
    const db = c.get("db");
    const userId = getUserId(c);
    await ensureInbox(db, userId);
    const rows = await collectionsRepo(db).listForUser(userId);
    return c.json(rows.map((row) => toCollection(row)));
  })

  // ── CREATE ──────────────────────────────────────────────────────────────────
  .post("/collections", zValidator("json", createCollectionSchema), async (c) => {
    const collections = collectionsRepo(c.get("db"));
    const userId = getUserId(c);
    const body = c.req.valid("json");
    const row = await collections.create({
      user_id: userId,
      name: body.name,
      description: body.description ?? null,
      available_for_deckbuilding: body.availableForDeckbuilding ?? true,
      is_inbox: false,
      sort_order: 0,
    });
    return c.json(toCollection(row), 201);
  })

  // ── GET ONE ─────────────────────────────────────────────────────────────────
  .get("/collections/:id", zValidator("param", idParamSchema), async (c) => {
    const collections = collectionsRepo(c.get("db"));
    const { id } = c.req.valid("param");
    const row = await collections.getByIdForUser(id, getUserId(c));
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
      const collections = collectionsRepo(c.get("db"));
      const userId = getUserId(c);
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const updates = buildPatchUpdates(body, patchFields);
      const row = await collections.update(id, userId, updates);
      if (!row) {
        throw new AppError(404, "NOT_FOUND", "Not found");
      }
      return c.json(toCollection(row));
    },
  )

  // ── DELETE /collections/:id ─────────────────────────────────────────────────
  // Complex: validates inbox, relocates copies, logs activity
  .delete("/collections/:id", zValidator("param", idParamSchema), async (c) => {
    const db = c.get("db");
    const collections = collectionsRepo(db);
    const userId = getUserId(c);
    const { id } = c.req.valid("param");
    const moveCopiesTo = c.req.query("move_copies_to");

    const collection = await collections.getByIdForUser(id, userId);

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
    const target = await collections.getIdAndName(moveCopiesTo, userId);

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
    const db = c.get("db");
    const userId = getUserId(c);
    const { id } = c.req.valid("param");

    // Verify collection belongs to user
    const collection = await collectionsRepo(db).exists(id, userId);
    if (!collection) {
      throw new AppError(404, "NOT_FOUND", "Not found");
    }

    const rows = await copiesRepo(db).listForCollection(id);
    return c.json(rows.map((row) => toCopy(row)));
  });
