import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod/v4";

// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { db } from "../../db.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { AppError } from "../../errors.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { requireAdmin } from "../../middleware/require-admin.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import type { Variables } from "../../types.js";

// ── Schemas ─────────────────────────────────────────────────────────────────

const createFlagSchema = z.object({
  key: z
    .string()
    .min(1)
    .regex(/^[a-z][a-z0-9]+(-[a-z0-9]+)*$/, "Key must be kebab-case (e.g. deck-builder)"),
  description: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
});

const updateFlagSchema = z.object({
  enabled: z.boolean().optional(),
  description: z.string().nullable().optional(),
});

// ── Route ───────────────────────────────────────────────────────────────────

export const featureFlagsRoute = new Hono<{ Variables: Variables }>()

  // ── Public: GET /feature-flags ──────────────────────────────────────────────
  // Returns { key: enabled } map for the client to consume at boot.

  .get("/feature-flags", async (c) => {
    const rows = await db.selectFrom("feature_flags").select(["key", "enabled"]).execute();

    const flags: Record<string, boolean> = {};
    for (const row of rows) {
      flags[row.key] = row.enabled;
    }
    return c.json(flags);
  })

  // ── Admin: GET /admin/feature-flags ─────────────────────────────────────────

  .use("/admin/feature-flags", requireAdmin)
  .use("/admin/feature-flags/*", requireAdmin)

  .get("/admin/feature-flags", async (c) => {
    const flags = await db.selectFrom("feature_flags").selectAll().orderBy("key").execute();

    return c.json({ flags });
  })

  // ── Admin: POST /admin/feature-flags ────────────────────────────────────────

  .post("/admin/feature-flags", zValidator("json", createFlagSchema), async (c) => {
    const { key, description, enabled } = c.req.valid("json");

    const existing = await db
      .selectFrom("feature_flags")
      .select("key")
      .where("key", "=", key)
      .executeTakeFirst();

    if (existing) {
      throw new AppError(409, "CONFLICT", `Flag "${key}" already exists`);
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
  })

  // ── Admin: PATCH /admin/feature-flags/:key ──────────────────────────────────

  .patch("/admin/feature-flags/:key", zValidator("json", updateFlagSchema), async (c) => {
    const key = c.req.param("key");
    const body = c.req.valid("json");

    const existing = await db
      .selectFrom("feature_flags")
      .select("key")
      .where("key", "=", key)
      .executeTakeFirst();

    if (!existing) {
      throw new AppError(404, "NOT_FOUND", `Flag "${key}" not found`);
    }

    const updates: Record<string, unknown> = { updated_at: new Date() };
    if (body.enabled !== undefined) {
      updates.enabled = body.enabled;
    }
    if (body.description !== undefined) {
      updates.description = body.description;
    }

    await db.updateTable("feature_flags").set(updates).where("key", "=", key).execute();

    return c.json({ ok: true });
  })

  // ── Admin: DELETE /admin/feature-flags/:key ─────────────────────────────────

  .delete("/admin/feature-flags/:key", async (c) => {
    const key = c.req.param("key");

    const result = await db.deleteFrom("feature_flags").where("key", "=", key).executeTakeFirst();

    if (result.numDeletedRows === 0n) {
      throw new AppError(404, "NOT_FOUND", `Flag "${key}" not found`);
    }

    return c.json({ ok: true });
  });
