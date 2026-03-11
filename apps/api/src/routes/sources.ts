import type { Source } from "@openrift/shared";
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
import type { Variables } from "../types.js";

export const sourcesRoute = new Hono<{ Variables: Variables }>();

sourcesRoute.use("/sources/*", requireAuth);
sourcesRoute.use("/sources", requireAuth);

function toSource(row: {
  id: string;
  name: string;
  description: string | null;
  created_at: Date;
  updated_at: Date;
}): Source {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

// ── GET /sources ──────────────────────────────────────────────────────────────

sourcesRoute.get("/sources", async (c) => {
  const userId = getUserId(c);

  const rows = await db
    .selectFrom("sources")
    .selectAll()
    .where("user_id", "=", userId)
    .orderBy("name")
    .execute();

  return c.json(rows.map((row) => toSource(row)));
});

// ── POST /sources ─────────────────────────────────────────────────────────────

sourcesRoute.post("/sources", async (c) => {
  const userId = getUserId(c);
  const body = createSourceSchema.parse(await c.req.json());

  const id = crypto.randomUUID();
  const row = await db
    .insertInto("sources")
    .values({
      id,
      user_id: userId,
      name: body.name,
      description: body.description ?? null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  return c.json(toSource(row), 201);
});

// ── GET /sources/:id ──────────────────────────────────────────────────────────

sourcesRoute.get("/sources/:id", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");

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
});

// ── PATCH /sources/:id ────────────────────────────────────────────────────────

sourcesRoute.patch("/sources/:id", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const body = updateSourceSchema.parse(await c.req.json());

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) {
    updates.name = body.name;
  }
  if (body.description !== undefined) {
    updates.description = body.description;
  }

  if (Object.keys(updates).length === 0) {
    throw new AppError(400, "BAD_REQUEST", "No fields to update");
  }

  updates.updated_at = new Date();

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
});

// ── DELETE /sources/:id ───────────────────────────────────────────────────────

sourcesRoute.delete("/sources/:id", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");

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
