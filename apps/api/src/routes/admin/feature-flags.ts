import { zValidator } from "@hono/zod-validator";
import type { FeatureFlagResponse } from "@openrift/shared";
import { keyParamSchema } from "@openrift/shared/schemas";
import { Hono } from "hono";
import { z } from "zod/v4";

import { AppError } from "../../errors.js";
import { requireAdmin } from "../../middleware/require-admin.js";
import { featureFlagsRepo } from "../../repositories/feature-flags.js";
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
    const flagsRepo = featureFlagsRepo(c.get("db"));
    const rows = await flagsRepo.listKeyEnabled();

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
    const flagsRepo = featureFlagsRepo(c.get("db"));
    const rows = await flagsRepo.listAll();
    const flags: FeatureFlagResponse[] = rows.map((r) => ({
      key: r.key,
      enabled: r.enabled,
      description: r.description,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
      updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
    }));
    return c.json({ flags });
  })

  // ── Admin: POST /admin/feature-flags ────────────────────────────────────────

  .post("/admin/feature-flags", zValidator("json", createFlagSchema), async (c) => {
    const flagsRepo = featureFlagsRepo(c.get("db"));
    const { key, description, enabled } = c.req.valid("json");

    const existing = await flagsRepo.getByKey(key);
    if (existing) {
      throw new AppError(409, "CONFLICT", `Flag "${key}" already exists`);
    }

    await flagsRepo.create({
      key,
      enabled: enabled ?? false,
      description: description ?? null,
    });

    return c.body(null, 204);
  })

  // ── Admin: PATCH /admin/feature-flags/:key ──────────────────────────────────

  .patch(
    "/admin/feature-flags/:key",
    zValidator("param", keyParamSchema),
    zValidator("json", updateFlagSchema),
    async (c) => {
      const flagsRepo = featureFlagsRepo(c.get("db"));
      const { key } = c.req.valid("param");
      const body = c.req.valid("json");

      const existing = await flagsRepo.getByKey(key);
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

      await flagsRepo.update(key, updates);

      return c.body(null, 204);
    },
  )

  // ── Admin: DELETE /admin/feature-flags/:key ─────────────────────────────────

  .delete("/admin/feature-flags/:key", zValidator("param", keyParamSchema), async (c) => {
    const flagsRepo = featureFlagsRepo(c.get("db"));
    const { key } = c.req.valid("param");

    const result = await flagsRepo.deleteByKey(key);
    if (result.numDeletedRows === 0n) {
      throw new AppError(404, "NOT_FOUND", `Flag "${key}" not found`);
    }

    return c.body(null, 204);
  });
