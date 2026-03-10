import { Hono } from "hono";
import { z } from "zod/v4";

// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { db } from "../../db.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { requireAdmin } from "../../middleware/require-admin.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import type { Variables } from "../../types.js";

export const featureFlagsRoute = new Hono<{ Variables: Variables }>();

// ── Public: GET /feature-flags ──────────────────────────────────────────────
// Returns { key: enabled } map for the client to consume at boot.

featureFlagsRoute.get("/feature-flags", async (c) => {
  const rows = await db.selectFrom("feature_flags").select(["key", "enabled"]).execute();

  const flags: Record<string, boolean> = {};
  for (const row of rows) {
    flags[row.key] = row.enabled;
  }
  return c.json(flags);
});

// ── Admin: GET /admin/feature-flags ─────────────────────────────────────────

featureFlagsRoute.use("/admin/feature-flags", requireAdmin);
featureFlagsRoute.use("/admin/feature-flags/*", requireAdmin);

featureFlagsRoute.get("/admin/feature-flags", async (c) => {
  const flags = await db.selectFrom("feature_flags").selectAll().orderBy("key").execute();

  return c.json({ flags });
});

// ── Admin: POST /admin/feature-flags ────────────────────────────────────────

const createFlagSchema = z.object({
  key: z
    .string()
    .min(1)
    .regex(/^[a-z][a-z0-9]+(-[a-z0-9]+)*$/, "Key must be kebab-case (e.g. deck-builder)"),
  description: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
});

featureFlagsRoute.post("/admin/feature-flags", async (c) => {
  const body = await c.req.json();
  const parsed = createFlagSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request body", details: parsed.error.issues }, 400);
  }

  const { key, description, enabled } = parsed.data;

  const existing = await db
    .selectFrom("feature_flags")
    .select("key")
    .where("key", "=", key)
    .executeTakeFirst();

  if (existing) {
    return c.json({ error: `Flag "${key}" already exists` }, 409);
  }

  await db
    .insertInto("feature_flags")
    .values({
      key,
      enabled: enabled ?? false,
      description: description ?? null,
    })
    .execute();

  return c.json({ ok: true });
});

// ── Admin: PATCH /admin/feature-flags/:key ──────────────────────────────────

const updateFlagSchema = z.object({
  enabled: z.boolean().optional(),
  description: z.string().nullable().optional(),
});

featureFlagsRoute.patch("/admin/feature-flags/:key", async (c) => {
  const key = c.req.param("key");
  const body = await c.req.json();
  const parsed = updateFlagSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request body", details: parsed.error.issues }, 400);
  }

  const existing = await db
    .selectFrom("feature_flags")
    .select("key")
    .where("key", "=", key)
    .executeTakeFirst();

  if (!existing) {
    return c.json({ error: `Flag "${key}" not found` }, 404);
  }

  const updates: Record<string, unknown> = { updated_at: new Date() };
  if (parsed.data.enabled !== undefined) {
    updates.enabled = parsed.data.enabled;
  }
  if (parsed.data.description !== undefined) {
    updates.description = parsed.data.description;
  }

  await db.updateTable("feature_flags").set(updates).where("key", "=", key).execute();

  return c.json({ ok: true });
});

// ── Admin: DELETE /admin/feature-flags/:key ─────────────────────────────────

featureFlagsRoute.delete("/admin/feature-flags/:key", async (c) => {
  const key = c.req.param("key");

  const result = await db.deleteFrom("feature_flags").where("key", "=", key).executeTakeFirst();

  if (result.numDeletedRows === 0n) {
    return c.json({ error: `Flag "${key}" not found` }, 404);
  }

  return c.json({ ok: true });
});
