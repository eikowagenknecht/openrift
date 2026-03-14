import { zValidator } from "@hono/zod-validator";
import { createSourceSchema, updateSourceSchema } from "@openrift/shared/schemas";
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

// oxlint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic table names lose Kysely's static types
const dynDb = db as any;

const patchFields: FieldMapping = { name: "name", description: "description" };

export const sourcesRoute = new Hono<{ Variables: Variables }>()
  .use("/sources/*", requireAuth)
  .use("/sources", requireAuth)

  // ── LIST ────────────────────────────────────────────────────────────────────
  .get("/sources", async (c) => {
    const userId = getUserId(c);
    const rows = await dynDb
      .selectFrom("sources")
      .selectAll()
      .where("user_id", "=", userId)
      .orderBy("name")
      .execute();
    return c.json(rows.map((row: object) => toSource(row)));
  })

  // ── CREATE ──────────────────────────────────────────────────────────────────
  .post("/sources", zValidator("json", createSourceSchema), async (c) => {
    const userId = getUserId(c);
    const body = c.req.valid("json");
    const row = await dynDb
      .insertInto("sources")
      .values({
        user_id: userId,
        name: body.name,
        description: body.description ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return c.json(toSource(row as object), 201);
  })

  // ── GET ONE ─────────────────────────────────────────────────────────────────
  .get("/sources/:id", async (c) => {
    const userId = getUserId(c);
    const row = await dynDb
      .selectFrom("sources")
      .selectAll()
      .where("id", "=", c.req.param("id"))
      .where("user_id", "=", userId)
      .executeTakeFirst();
    if (!row) {
      throw new AppError(404, "NOT_FOUND", "Not found");
    }
    return c.json(toSource(row as object));
  })

  // ── UPDATE ──────────────────────────────────────────────────────────────────
  .patch("/sources/:id", zValidator("json", updateSourceSchema), async (c) => {
    const userId = getUserId(c);
    const body = c.req.valid("json");
    const updates = buildPatchUpdates(body, patchFields);
    const row = await dynDb
      .updateTable("sources")
      .set(updates)
      .where("id", "=", c.req.param("id"))
      .where("user_id", "=", userId)
      .returningAll()
      .executeTakeFirst();
    if (!row) {
      throw new AppError(404, "NOT_FOUND", "Not found");
    }
    return c.json(toSource(row as object));
  })

  // ── DELETE ──────────────────────────────────────────────────────────────────
  .delete("/sources/:id", async (c) => {
    const userId = getUserId(c);
    const result = await dynDb
      .deleteFrom("sources")
      .where("id", "=", c.req.param("id"))
      .where("user_id", "=", userId)
      .executeTakeFirst();
    if (result.numDeletedRows === 0n) {
      throw new AppError(404, "NOT_FOUND", "Not found");
    }
    return c.json({ ok: true });
  });
