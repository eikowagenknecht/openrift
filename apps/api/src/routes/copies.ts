import { zValidator } from "@hono/zod-validator";
import {
  addCopiesSchema,
  disposeCopiesSchema,
  idParamSchema,
  moveCopiesSchema,
} from "@openrift/shared/schemas";
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
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { toCopy } from "../utils/dto.js";

export const copiesRoute = new Hono<{ Variables: Variables }>()
  .use("/copies/*", requireAuth)
  .use("/copies", requireAuth)

  // ── GET /copies ─────────────────────────────────────────────────────────────
  // All copies for the authenticated user (combined view)

  .get("/copies", async (c) => {
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

    return c.json(copies.map((row) => toCopy(row)));
  })

  // ── POST /copies ────────────────────────────────────────────────────────────
  // Batch add copies (acquisition)

  .post("/copies", zValidator("json", addCopiesSchema), async (c) => {
    const userId = getUserId(c);
    const body = c.req.valid("json");
    const result = await addCopies(db, userId, body.copies);
    return c.json(result, 201);
  })

  // ── POST /copies/move ───────────────────────────────────────────────────────
  // Move copies between collections (reorganization)

  .post("/copies/move", zValidator("json", moveCopiesSchema), async (c) => {
    const userId = getUserId(c);
    const body = c.req.valid("json");
    await moveCopies(db, userId, body.copyIds, body.toCollectionId);
    return c.json({ ok: true });
  })

  // ── POST /copies/dispose ────────────────────────────────────────────────────
  // Dispose copies (disposal) — hard-deletes with metadata snapshot

  .post("/copies/dispose", zValidator("json", disposeCopiesSchema), async (c) => {
    const userId = getUserId(c);
    const body = c.req.valid("json");
    await disposeCopies(db, userId, body.copyIds);
    return c.json({ ok: true });
  })

  // ── GET /copies/count ───────────────────────────────────────────────────────
  // Returns owned count per printing for the authenticated user

  .get("/copies/count", async (c) => {
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
  })

  // ── GET /copies/:id ─────────────────────────────────────────────────────────

  .get("/copies/:id", zValidator("param", idParamSchema), async (c) => {
    const userId = getUserId(c);
    const { id } = c.req.valid("param");

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
        "p.art_variant",
        "p.is_signed",
        "p.finish",
        imageUrl("pi").as("image_url"),
        "p.artist",
        "c.name as card_name",
        "c.type as card_type",
      ])
      .where("cp.id", "=", id)
      .where("cp.user_id", "=", userId)
      .executeTakeFirst();

    if (!copy) {
      throw new AppError(404, "NOT_FOUND", "Not found");
    }

    return c.json(toCopy(copy));
  });
