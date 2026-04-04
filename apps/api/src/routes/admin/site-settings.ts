import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { SiteSettingResponse } from "@openrift/shared";
import { keyParamSchema } from "@openrift/shared/schemas";
import { z } from "zod";

import { AppError, ERROR_CODES } from "../../errors.js";
import type { Variables } from "../../types.js";
import { createSettingSchema, updateSettingSchema } from "./schemas.js";

// ── Route definitions ───────────────────────────────────────────────────────

const listSettings = createRoute({
  method: "get",
  path: "/site-settings",
  tags: ["Admin - Site Settings"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            settings: z.array(
              z.object({
                key: z.string(),
                value: z.string(),
                scope: z.string(),
                createdAt: z.string(),
                updatedAt: z.string(),
              }),
            ),
          }),
        },
      },
      description: "List site settings",
    },
  },
});

const createSetting = createRoute({
  method: "post",
  path: "/site-settings",
  tags: ["Admin - Site Settings"],
  request: {
    body: { content: { "application/json": { schema: createSettingSchema } } },
  },
  responses: {
    201: { description: "Created" },
  },
});

const updateSetting = createRoute({
  method: "patch",
  path: "/site-settings/{key}",
  tags: ["Admin - Site Settings"],
  request: {
    params: keyParamSchema,
    body: { content: { "application/json": { schema: updateSettingSchema } } },
  },
  responses: {
    204: { description: "No Content" },
  },
});

const deleteSetting = createRoute({
  method: "delete",
  path: "/site-settings/{key}",
  tags: ["Admin - Site Settings"],
  request: {
    params: keyParamSchema,
  },
  responses: {
    204: { description: "No Content" },
  },
});

// ── Route ───────────────────────────────────────────────────────────────────

export const adminSiteSettingsRoute = new OpenAPIHono<{ Variables: Variables }>()

  .openapi(listSettings, async (c) => {
    const { siteSettings } = c.get("repos");
    const rows = await siteSettings.listAll();
    return c.json({
      settings: rows.map(
        (r): SiteSettingResponse => ({
          key: r.key,
          value: r.value,
          scope: r.scope,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        }),
      ),
    });
  })

  .openapi(createSetting, async (c) => {
    const { siteSettings } = c.get("repos");
    const { key, value, scope } = c.req.valid("json");

    const created = await siteSettings.create({
      key,
      value,
      scope: scope ?? "web",
    });
    if (!created) {
      throw new AppError(409, ERROR_CODES.CONFLICT, `Setting "${key}" already exists`);
    }

    return c.body(null, 201);
  })

  .openapi(updateSetting, async (c) => {
    const { siteSettings } = c.get("repos");
    const { key } = c.req.valid("param");
    const body = c.req.valid("json");

    const updated = await siteSettings.update(key, body);
    if (!updated) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, `Setting "${key}" not found`);
    }

    return c.body(null, 204);
  })

  .openapi(deleteSetting, async (c) => {
    const { siteSettings } = c.get("repos");
    const { key } = c.req.valid("param");

    const result = await siteSettings.deleteByKey(key);
    if (result.numDeletedRows === 0n) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, `Setting "${key}" not found`);
    }

    return c.body(null, 204);
  });
