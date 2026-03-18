import { zValidator } from "@hono/zod-validator";
import type { SourceSettingResponse } from "@openrift/shared";
import { Hono } from "hono";
import { z } from "zod/v4";

import { AppError } from "../../errors.js";
import type { Variables } from "../../types.js";

// ── Schemas ─────────────────────────────────────────────────────────────────

const updateSchema = z.object({
  sortOrder: z.number().int().optional(),
  isHidden: z.boolean().optional(),
});

const reorderSchema = z.object({
  sources: z.array(z.string().min(1)).min(1),
});

const sourceParamSchema = z.object({
  source: z.string().min(1),
});

// ── Route ───────────────────────────────────────────────────────────────────

export const adminSourceSettingsRoute = new Hono<{ Variables: Variables }>()

  // ── GET /admin/source-settings ──────────────────────────────────────────

  .get("/source-settings", async (c) => {
    const { sourceSettings: repo } = c.get("repos");
    const rows = await repo.listAll();
    return c.json({
      sourceSettings: rows.map(
        (r): SourceSettingResponse => ({
          source: r.source,
          sortOrder: r.sortOrder,
          isHidden: r.isHidden,
        }),
      ),
    });
  })

  // ── PUT /admin/source-settings/reorder ──────────────────────────────────

  .put("/source-settings/reorder", zValidator("json", reorderSchema), async (c) => {
    const { sourceSettings: repo } = c.get("repos");
    const { sources } = c.req.valid("json");

    const uniqueSources = new Set(sources);
    if (uniqueSources.size !== sources.length) {
      throw new AppError(400, "BAD_REQUEST", "Duplicate sources in reorder list");
    }

    await repo.reorder(sources);
    return c.body(null, 204);
  })

  // ── PATCH /admin/source-settings/:source ────────────────────────────────

  .patch(
    "/source-settings/:source",
    zValidator("param", sourceParamSchema),
    zValidator("json", updateSchema),
    async (c) => {
      const { sourceSettings: repo } = c.get("repos");
      const { source } = c.req.valid("param");
      const body = c.req.valid("json");

      await repo.upsert(source, body);
      return c.body(null, 204);
    },
  );
