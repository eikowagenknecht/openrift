import { addCopiesSchema, disposeCopiesSchema, moveCopiesSchema } from "@openrift/shared/schemas";
import { Hono } from "hono";

// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { imageUrl, selectCopyWithCard } from "../db-helpers.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { db } from "../db.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { AppError } from "../errors.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { getUserId } from "../middleware/get-user-id.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { requireAuth } from "../middleware/require-auth.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { addCopies, disposeCopies, moveCopies } from "../services/copies.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import type { Variables } from "../types.js";

export const copiesRoute = new Hono<{ Variables: Variables }>();

copiesRoute.use("/copies/*", requireAuth);
copiesRoute.use("/copies", requireAuth);

// ── GET /copies ───────────────────────────────────────────────────────────────
// All copies for the authenticated user (combined view)

copiesRoute.get("/copies", async (c) => {
  const userId = getUserId(c);

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
      "p.is_promo",
      "p.finish",
      imageUrl("pi").as("image_url"),
      "p.artist",
      "c.name as card_name",
      "c.type as card_type",
    ])
    .where("cp.user_id", "=", userId)
    .orderBy("c.name")
    .orderBy("p.collector_number")
    .execute();

  return c.json(copies);
});

// ── POST /copies ──────────────────────────────────────────────────────────────
// Batch add copies (acquisition)

copiesRoute.post("/copies", async (c) => {
  const userId = getUserId(c);
  const body = addCopiesSchema.parse(await c.req.json());
  const result = await addCopies(db, userId, body.copies);
  return c.json(result, 201);
});

// ── POST /copies/move ─────────────────────────────────────────────────────────
// Move copies between collections (reorganization)

copiesRoute.post("/copies/move", async (c) => {
  const userId = getUserId(c);
  const body = moveCopiesSchema.parse(await c.req.json());
  await moveCopies(db, userId, body.copyIds, body.toCollectionId);
  return c.json({ ok: true });
});

// ── POST /copies/dispose ──────────────────────────────────────────────────────
// Dispose copies (disposal) — hard-deletes with metadata snapshot

copiesRoute.post("/copies/dispose", async (c) => {
  const userId = getUserId(c);
  const body = disposeCopiesSchema.parse(await c.req.json());
  await disposeCopies(db, userId, body.copyIds);
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

  const copy = await selectCopyWithCard(db)
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
      "c.name as card_name",
      "c.type as card_type",
    ])
    .where("cp.id", "=", id)
    .where("cp.user_id", "=", userId)
    .executeTakeFirst();

  if (!copy) {
    throw new AppError(404, "NOT_FOUND", "Not found");
  }

  return c.json(copy);
});
