import { zValidator } from "@hono/zod-validator";
import { createSourceSchema, idParamSchema, updateSourceSchema } from "@openrift/shared/schemas";
import { Hono } from "hono";

import { AppError } from "../errors.js";
import { getUserId } from "../middleware/get-user-id.js";
import { requireAuth } from "../middleware/require-auth.js";
import { buildPatchUpdates } from "../patch.js";
import type { FieldMapping } from "../patch.js";
import { sourcesRepo } from "../repositories/sources.js";
import type { Variables } from "../types.js";
import { toSource } from "../utils/mappers.js";

const patchFields: FieldMapping = { name: "name", description: "description" };

export const sourcesRoute = new Hono<{ Variables: Variables }>()
  .use("/sources/*", requireAuth)
  .use("/sources", requireAuth)

  // ── LIST ────────────────────────────────────────────────────────────────────
  .get("/sources", async (c) => {
    const sources = sourcesRepo(c.get("db"));
    const rows = await sources.listForUser(getUserId(c));
    return c.json(rows.map((row) => toSource(row)));
  })

  // ── CREATE ──────────────────────────────────────────────────────────────────
  .post("/sources", zValidator("json", createSourceSchema), async (c) => {
    const sources = sourcesRepo(c.get("db"));
    const userId = getUserId(c);
    const body = c.req.valid("json");
    const row = await sources.create({
      userId,
      name: body.name,
      description: body.description ?? null,
    });
    return c.json(toSource(row), 201);
  })

  // ── GET ONE ─────────────────────────────────────────────────────────────────
  .get("/sources/:id", zValidator("param", idParamSchema), async (c) => {
    const sources = sourcesRepo(c.get("db"));
    const { id } = c.req.valid("param");
    const row = await sources.getByIdForUser(id, getUserId(c));
    if (!row) {
      throw new AppError(404, "NOT_FOUND", "Not found");
    }
    return c.json(toSource(row));
  })

  // ── UPDATE ──────────────────────────────────────────────────────────────────
  .patch(
    "/sources/:id",
    zValidator("param", idParamSchema),
    zValidator("json", updateSourceSchema),
    async (c) => {
      const sources = sourcesRepo(c.get("db"));
      const userId = getUserId(c);
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const updates = buildPatchUpdates(body, patchFields);
      const row = await sources.update(id, userId, updates);
      if (!row) {
        throw new AppError(404, "NOT_FOUND", "Not found");
      }
      return c.json(toSource(row));
    },
  )

  // ── DELETE ──────────────────────────────────────────────────────────────────
  .delete("/sources/:id", zValidator("param", idParamSchema), async (c) => {
    const sources = sourcesRepo(c.get("db"));
    const { id } = c.req.valid("param");
    const result = await sources.deleteByIdForUser(id, getUserId(c));
    if (result.numDeletedRows === 0n) {
      throw new AppError(404, "NOT_FOUND", "Not found");
    }
    return c.json({ ok: true });
  });
