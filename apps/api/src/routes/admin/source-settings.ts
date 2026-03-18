import { zValidator } from "@hono/zod-validator";
import type { SourceSettingResponse } from "@openrift/shared";
import { Hono } from "hono";
import { z } from "zod/v4";

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

  .get("/admin/source-settings", async (c) => {
    const { sourceSettings: repo } = c.get("repos");
    const rows = await repo.listAll();
    const sourceSettings: SourceSettingResponse[] = rows.map((r) => ({
      source: r.source,
      sortOrder: r.sortOrder,
      isHidden: r.isHidden,
    }));
    return c.json({ sourceSettings });
  })

  // ── PUT /admin/source-settings/reorder ──────────────────────────────────

  .put("/admin/source-settings/reorder", zValidator("json", reorderSchema), async (c) => {
    const { sourceSettings: repo } = c.get("repos");
    const { sources } = c.req.valid("json");

    const uniqueSources = new Set(sources);
    if (uniqueSources.size !== sources.length) {
      return c.json({ error: "Duplicate sources in reorder list" }, 400);
    }

    await repo.reorder(sources);
    return c.body(null, 204);
  })

  // ── PATCH /admin/source-settings/:source ────────────────────────────────

  .patch(
    "/admin/source-settings/:source",
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
