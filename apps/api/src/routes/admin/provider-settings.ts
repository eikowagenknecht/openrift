import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { ProviderSettingResponse } from "@openrift/shared";
import { providerParamSchema } from "@openrift/shared/schemas";
import { z } from "zod";

import { AppError, ERROR_CODES } from "../../errors.js";
import type { Variables } from "../../types.js";

// ── Schemas ─────────────────────────────────────────────────────────────────

const updateSchema = z.object({
  sortOrder: z.number().int().optional(),
  isHidden: z.boolean().optional(),
});

const reorderSchema = z.object({
  providers: z.array(z.string().min(1)).min(1),
});

// ── Route definitions ───────────────────────────────────────────────────────

const listProviderSettings = createRoute({
  method: "get",
  path: "/provider-settings",
  tags: ["Admin - Provider Settings"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            providerSettings: z.array(
              z.object({
                provider: z.string(),
                sortOrder: z.number(),
                isHidden: z.boolean(),
              }),
            ),
          }),
        },
      },
      description: "List provider settings",
    },
  },
});

const reorderProviders = createRoute({
  method: "put",
  path: "/provider-settings/reorder",
  tags: ["Admin - Provider Settings"],
  request: {
    body: { content: { "application/json": { schema: reorderSchema } } },
  },
  responses: {
    204: { description: "Providers reordered" },
  },
});

const updateProviderSetting = createRoute({
  method: "patch",
  path: "/provider-settings/{provider}",
  tags: ["Admin - Provider Settings"],
  request: {
    params: providerParamSchema,
    body: { content: { "application/json": { schema: updateSchema } } },
  },
  responses: {
    204: { description: "Provider setting updated" },
  },
});

// ── Route ───────────────────────────────────────────────────────────────────

export const adminProviderSettingsRoute = new OpenAPIHono<{ Variables: Variables }>()

  // ── GET /admin/provider-settings ──────────────────────────────────────────

  .openapi(listProviderSettings, async (c) => {
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

  .openapi(reorderProviders, async (c) => {
    const { providerSettings: repo } = c.get("repos");
    const { providers } = c.req.valid("json");

    const uniqueProviders = new Set(providers);
    if (uniqueProviders.size !== providers.length) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "Duplicate providers in reorder list");
    }

    await repo.reorder(providers);
    return c.body(null, 204);
  })

  // ── PATCH /admin/provider-settings/:provider ────────────────────────────────

  .openapi(updateProviderSetting, async (c) => {
    const { providerSettings: repo } = c.get("repos");
    const { provider } = c.req.valid("param");
    const body = c.req.valid("json");

    await repo.upsert(provider, body);
    return c.body(null, 204);
  });
