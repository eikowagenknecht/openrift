import { zValidator } from "@hono/zod-validator";
import type { ProviderSettingResponse } from "@openrift/shared";
import { providerParamSchema } from "@openrift/shared/schemas";
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
  providers: z.array(z.string().min(1)).min(1),
});

// ── Route ───────────────────────────────────────────────────────────────────

export const adminProviderSettingsRoute = new Hono<{ Variables: Variables }>()

  // ── GET /admin/provider-settings ──────────────────────────────────────────

  .get("/provider-settings", async (c) => {
    const { providerSettings: repo } = c.get("repos");
    const rows = await repo.listAll();
    return c.json({
      providerSettings: rows.map(
        (r): ProviderSettingResponse => ({
          provider: r.provider,
          sortOrder: r.sortOrder,
          isHidden: r.isHidden,
        }),
      ),
    });
  })

  // ── PUT /admin/provider-settings/reorder ──────────────────────────────────

  .put("/provider-settings/reorder", zValidator("json", reorderSchema), async (c) => {
    const { providerSettings: repo } = c.get("repos");
    const { providers } = c.req.valid("json");

    const uniqueProviders = new Set(providers);
    if (uniqueProviders.size !== providers.length) {
      throw new AppError(400, "BAD_REQUEST", "Duplicate providers in reorder list");
    }

    await repo.reorder(providers);
    return c.body(null, 204);
  })

  // ── PATCH /admin/provider-settings/:provider ────────────────────────────────

  .patch(
    "/provider-settings/:provider",
    zValidator("param", providerParamSchema),
    zValidator("json", updateSchema),
    async (c) => {
      const { providerSettings: repo } = c.get("repos");
      const { provider } = c.req.valid("param");
      const body = c.req.valid("json");

      await repo.upsert(provider, body);
      return c.body(null, 204);
    },
  );
