import { zValidator } from "@hono/zod-validator";
import {
  addCopiesSchema,
  disposeCopiesSchema,
  idParamSchema,
  moveCopiesSchema,
} from "@openrift/shared/schemas";
import { Hono } from "hono";

import { AppError } from "../errors.js";
import { getUserId } from "../middleware/get-user-id.js";
import { requireAuth } from "../middleware/require-auth.js";
import { copiesRepo } from "../repositories/copies.js";
import { addCopies, disposeCopies, moveCopies } from "../services/copies.js";
import type { Variables } from "../types.js";
import { toCopy } from "../utils/dto.js";

export const copiesRoute = new Hono<{ Variables: Variables }>()
  .use("/copies/*", requireAuth)
  .use("/copies", requireAuth)

  // ── GET /copies ─────────────────────────────────────────────────────────────
  // All copies for the authenticated user (combined view)

  .get("/copies", async (c) => {
    const copies = copiesRepo(c.get("db"));
    const rows = await copies.listForUser(getUserId(c));
    return c.json(rows.map((row) => toCopy(row)));
  })

  // ── POST /copies ────────────────────────────────────────────────────────────
  // Batch add copies (acquisition)

  .post("/copies", zValidator("json", addCopiesSchema), async (c) => {
    const db = c.get("db");
    const userId = getUserId(c);
    const body = c.req.valid("json");
    const result = await addCopies(db, userId, body.copies);
    return c.json(result, 201);
  })

  // ── POST /copies/move ───────────────────────────────────────────────────────
  // Move copies between collections (reorganization)

  .post("/copies/move", zValidator("json", moveCopiesSchema), async (c) => {
    const db = c.get("db");
    const userId = getUserId(c);
    const body = c.req.valid("json");
    await moveCopies(db, userId, body.copyIds, body.toCollectionId);
    return c.json({ ok: true });
  })

  // ── POST /copies/dispose ────────────────────────────────────────────────────
  // Dispose copies (disposal) — hard-deletes with metadata snapshot

  .post("/copies/dispose", zValidator("json", disposeCopiesSchema), async (c) => {
    const db = c.get("db");
    const userId = getUserId(c);
    const body = c.req.valid("json");
    await disposeCopies(db, userId, body.copyIds);
    return c.json({ ok: true });
  })

  // ── GET /copies/count ───────────────────────────────────────────────────────
  // Returns owned count per printing for the authenticated user

  .get("/copies/count", async (c) => {
    const copies = copiesRepo(c.get("db"));
    const rows = await copies.countByPrintingForUser(getUserId(c));

    const counts: Record<string, number> = {};
    for (const row of rows) {
      counts[row.printingId] = Number(row.count);
    }
    return c.json(counts);
  })

  // ── GET /copies/:id ─────────────────────────────────────────────────────────

  .get("/copies/:id", zValidator("param", idParamSchema), async (c) => {
    const copies = copiesRepo(c.get("db"));
    const { id } = c.req.valid("param");
    const copy = await copies.getByIdForUser(id, getUserId(c));
    if (!copy) {
      throw new AppError(404, "NOT_FOUND", "Not found");
    }
    return c.json(toCopy(copy));
  });
