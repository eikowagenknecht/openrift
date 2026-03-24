import { zValidator } from "@hono/zod-validator";
import type { CollectionListResponse, CopyListResponse } from "@openrift/shared";
import {
  copiesQuerySchema,
  createCollectionSchema,
  idParamSchema,
  updateCollectionSchema,
} from "@openrift/shared/schemas";
import { Hono } from "hono";

import { AppError } from "../../errors.js";
import { getUserId } from "../../middleware/get-user-id.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { buildPatchUpdates } from "../../patch.js";
import type { FieldMapping } from "../../patch.js";
import type { Variables } from "../../types.js";
import { toCollection, toCopy } from "../../utils/mappers.js";

const patchFields: FieldMapping = {
  name: "name",
  description: "description",
  availableForDeckbuilding: "availableForDeckbuilding",
  sortOrder: "sortOrder",
};

export const collectionsRoute = new Hono<{ Variables: Variables }>()
  .basePath("/collections")
  .use(requireAuth)

  // ── LIST ────────────────────────────────────────────────────────────────────
  .get("/", async (c) => {
    const { collections } = c.get("repos");
    const { ensureInbox } = c.get("services");
    const userId = getUserId(c);
    await ensureInbox(c.get("db"), userId);
    const rows = await collections.listForUser(userId);
    return c.json({
      collections: rows.map((row) => toCollection(row)),
    } satisfies CollectionListResponse);
  })

  // ── CREATE ──────────────────────────────────────────────────────────────────
  .post("/", zValidator("json", createCollectionSchema), async (c) => {
    const { collections } = c.get("repos");
    const userId = getUserId(c);
    const body = c.req.valid("json");
    const row = await collections.create({
      userId,
      name: body.name,
      description: body.description ?? null,
      availableForDeckbuilding: body.availableForDeckbuilding ?? true,
      isInbox: false,
      sortOrder: 0,
    });
    return c.json(toCollection(row), 201);
  })

  // ── GET ONE ─────────────────────────────────────────────────────────────────
  .get("/:id", zValidator("param", idParamSchema), async (c) => {
    const { collections } = c.get("repos");
    const { id } = c.req.valid("param");
    const row = await collections.getByIdForUser(id, getUserId(c));
    if (!row) {
      throw new AppError(404, "NOT_FOUND", "Not found");
    }
    return c.json(toCollection(row));
  })

  // ── UPDATE ──────────────────────────────────────────────────────────────────
  .patch(
    "/:id",
    zValidator("param", idParamSchema),
    zValidator("json", updateCollectionSchema),
    async (c) => {
      const { collections } = c.get("repos");
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
  .delete("/:id", zValidator("param", idParamSchema), async (c) => {
    const db = c.get("db");
    const repos = c.get("repos");
    const { deleteCollection } = c.get("services");
    const userId = getUserId(c);
    const { id } = c.req.valid("param");
    const moveCopiesTo = c.req.query("move_copies_to");

    const collection = await repos.collections.getByIdForUser(id, userId);

    if (!collection) {
      throw new AppError(404, "NOT_FOUND", "Not found");
    }

    if (collection.isInbox) {
      throw new AppError(400, "BAD_REQUEST", "Cannot delete inbox collection");
    }

    if (!moveCopiesTo) {
      throw new AppError(400, "BAD_REQUEST", "move_copies_to query parameter is required");
    }

    if (moveCopiesTo === id) {
      throw new AppError(400, "BAD_REQUEST", "Cannot move copies to the same collection");
    }

    // Verify target collection exists and belongs to user
    const target = await repos.collections.getIdAndName(moveCopiesTo, userId);

    if (!target) {
      throw new AppError(404, "NOT_FOUND", "Target collection not found");
    }

    await deleteCollection(db, repos, {
      collectionId: id,
      collectionName: collection.name,
      moveCopiesTo,
      targetName: target.name,
      userId,
    });

    return c.body(null, 204);
  })

  // ── GET /collections/:id/copies ─────────────────────────────────────────────
  .get(
    "/:id/copies",
    zValidator("param", idParamSchema),
    zValidator("query", copiesQuerySchema),
    async (c) => {
      const { collections, copies } = c.get("repos");
      const userId = getUserId(c);
      const { id } = c.req.valid("param");
      const { cursor, limit: rawLimit } = c.req.valid("query");
      const limit = rawLimit ?? 200;

      // Verify collection belongs to user
      const collection = await collections.exists(id, userId);
      if (!collection) {
        throw new AppError(404, "NOT_FOUND", "Not found");
      }

      const rows = await copies.listForCollection(id, limit, cursor);
      const hasMore = rows.length > limit;
      const items = rows.slice(0, limit);

      return c.json({
        copies: items.map((row) => toCopy(row)),
        nextCursor: hasMore ? (items.at(-1)?.createdAt.toISOString() ?? null) : null,
      } satisfies CopyListResponse);
    },
  );
