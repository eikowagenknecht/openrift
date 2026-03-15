import { zValidator } from "@hono/zod-validator";
import { createSourceSchema, idParamSchema, updateSourceSchema } from "@openrift/shared/schemas";
import { Hono } from "hono";

// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { db } from "../db.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { AppError } from "../errors.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { getUserId } from "../middleware/get-user-id.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { requireAuth } from "../middleware/require-auth.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { buildPatchUpdates } from "../patch.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import type { FieldMapping } from "../patch.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import type { Variables } from "../types.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { toSource } from "../utils/dto.js";

const patchFields: FieldMapping = { name: "name", description: "description" };

export const sourcesRoute = new Hono<{ Variables: Variables }>()
  .use("/sources/*", requireAuth)
  .use("/sources", requireAuth)

  // ── LIST ────────────────────────────────────────────────────────────────────
  .get("/sources", async (c) => {
    const userId = getUserId(c);
    const rows = await db
      .selectFrom("sources")
      .selectAll()
      .where("user_id", "=", userId)
      .orderBy("name")
      .execute();
    return c.json(rows.map((row) => toSource(row)));
  })

  // ── CREATE ──────────────────────────────────────────────────────────────────
  .post("/sources", zValidator("json", createSourceSchema), async (c) => {
    const userId = getUserId(c);
    const body = c.req.valid("json");
    const row = await db
      .insertInto("sources")
      .values({
        user_id: userId,
        name: body.name,
        description: body.description ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return c.json(toSource(row), 201);
  })

  // ── GET ONE ─────────────────────────────────────────────────────────────────
  .get("/sources/:id", zValidator("param", idParamSchema), async (c) => {
    const userId = getUserId(c);
    const { id } = c.req.valid("param");
    const row = await db
      .selectFrom("sources")
      .selectAll()
      .where("id", "=", id)
      .where("user_id", "=", userId)
      .executeTakeFirst();
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
      const userId = getUserId(c);
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const updates = buildPatchUpdates(body, patchFields);
      const row = await db
        .updateTable("sources")
        .set(updates)
        .where("id", "=", id)
        .where("user_id", "=", userId)
        .returningAll()
        .executeTakeFirst();
      if (!row) {
        throw new AppError(404, "NOT_FOUND", "Not found");
      }
      return c.json(toSource(row));
    },
  )

  // ── DELETE ──────────────────────────────────────────────────────────────────
  .delete("/sources/:id", zValidator("param", idParamSchema), async (c) => {
    const userId = getUserId(c);
    const { id } = c.req.valid("param");
    const result = await db
      .deleteFrom("sources")
      .where("id", "=", id)
      .where("user_id", "=", userId)
      .executeTakeFirst();
    if (result.numDeletedRows === 0n) {
      throw new AppError(404, "NOT_FOUND", "Not found");
    }
    return c.json({ ok: true });
  });
