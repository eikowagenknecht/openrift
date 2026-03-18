import { zValidator } from "@hono/zod-validator";
import type { FeatureFlagResponse } from "@openrift/shared";
import { keyParamSchema } from "@openrift/shared/schemas";
import { Hono } from "hono";
import { z } from "zod/v4";

import { AppError } from "../../errors.js";
import type { Variables } from "../../types.js";

// ── Schemas ─────────────────────────────────────────────────────────────────

const createFlagSchema = z.object({
  key: z
    .string()
    .regex(/^[a-z][a-z0-9]+(-[a-z0-9]+)*$/, "Key must be kebab-case (e.g. deck-builder)"),
  description: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
});

const updateFlagSchema = z
  .object({
    enabled: z.boolean().optional(),
    description: z.string().nullable().optional(),
  })
  .refine((o) => o.enabled !== undefined || o.description !== undefined, {
    message: "At least one field (enabled, description) must be provided",
  });

// ── Route ───────────────────────────────────────────────────────────────────

export const adminFeatureFlagsRoute = new Hono<{ Variables: Variables }>()

  // ── GET /admin/feature-flags ──────────────────────────────────────────────

  .get("/admin/feature-flags", async (c) => {
    const { featureFlags: flagsRepo } = c.get("repos");
    const rows = await flagsRepo.listAll();
    return c.json({
      flags: rows.map(
        (r): FeatureFlagResponse => ({
          key: r.key,
          enabled: r.enabled,
          description: r.description,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        }),
      ),
    });
  })

  // ── Admin: POST /admin/feature-flags ────────────────────────────────────────

  .post("/admin/feature-flags", zValidator("json", createFlagSchema), async (c) => {
    const { featureFlags: flagsRepo } = c.get("repos");
    const { key, description, enabled } = c.req.valid("json");

    const created = await flagsRepo.create({
      key,
      enabled: enabled ?? false,
      description: description ?? null,
    });
    if (!created) {
      throw new AppError(409, "CONFLICT", `Flag "${key}" already exists`);
    }

    return c.body(null, 201);
  })

  // ── Admin: PATCH /admin/feature-flags/:key ──────────────────────────────────

  .patch(
    "/admin/feature-flags/:key",
    zValidator("param", keyParamSchema),
    zValidator("json", updateFlagSchema),
    async (c) => {
      const { featureFlags: flagsRepo } = c.get("repos");
      const { key } = c.req.valid("param");
      const body = c.req.valid("json");

      const updated = await flagsRepo.update(key, body);
      if (!updated) {
        throw new AppError(404, "NOT_FOUND", `Flag "${key}" not found`);
      }

      return c.body(null, 204);
    },
  )

  // ── Admin: DELETE /admin/feature-flags/:key ─────────────────────────────────

  .delete("/admin/feature-flags/:key", zValidator("param", keyParamSchema), async (c) => {
    const { featureFlags: flagsRepo } = c.get("repos");
    const { key } = c.req.valid("param");

    const result = await flagsRepo.deleteByKey(key);
    if (result.numDeletedRows === 0n) {
      throw new AppError(404, "NOT_FOUND", `Flag "${key}" not found`);
    }

    return c.body(null, 204);
  });
