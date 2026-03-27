import { zValidator } from "@hono/zod-validator";
import type { SiteSettingResponse } from "@openrift/shared";
import { keyParamSchema } from "@openrift/shared/schemas";
import { Hono } from "hono";
import { z } from "zod/v4";

import { AppError } from "../../errors.js";
import type { Variables } from "../../types.js";

// ── Schemas ─────────────────────────────────────────────────────────────────

const scopeEnum = z.enum(["web", "api"]);

const createSettingSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9]+(-[a-z0-9]+)*$/, "Key must be kebab-case (e.g. umami-url)"),
  value: z.string(),
  scope: scopeEnum.optional(),
});

const updateSettingSchema = z
  .object({
    value: z.string().optional(),
    scope: scopeEnum.optional(),
  })
  .refine((o) => o.value !== undefined || o.scope !== undefined, {
    message: "At least one field (value, scope) must be provided",
  });

// ── Route ───────────────────────────────────────────────────────────────────

export const adminSiteSettingsRoute = new Hono<{ Variables: Variables }>()

  // ── GET /site-settings ───────────────────────────────────────────────────

  .get("/site-settings", async (c) => {
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

  // ── POST /site-settings ──────────────────────────────────────────────────

  .post("/site-settings", zValidator("json", createSettingSchema), async (c) => {
    const { siteSettings } = c.get("repos");
    const { key, value, scope } = c.req.valid("json");

    const created = await siteSettings.create({
      key,
      value,
      scope: scope ?? "web",
    });
    if (!created) {
      throw new AppError(409, "CONFLICT", `Setting "${key}" already exists`);
    }

    return c.body(null, 201);
  })

  // ── PATCH /site-settings/:key ─────────────────────────────────────────────

  .patch(
    "/site-settings/:key",
    zValidator("param", keyParamSchema),
    zValidator("json", updateSettingSchema),
    async (c) => {
      const { siteSettings } = c.get("repos");
      const { key } = c.req.valid("param");
      const body = c.req.valid("json");

      const updated = await siteSettings.update(key, body);
      if (!updated) {
        throw new AppError(404, "NOT_FOUND", `Setting "${key}" not found`);
      }

      return c.body(null, 204);
    },
  )

  // ── DELETE /site-settings/:key ────────────────────────────────────────────

  .delete("/site-settings/:key", zValidator("param", keyParamSchema), async (c) => {
    const { siteSettings } = c.get("repos");
    const { key } = c.req.valid("param");

    const result = await siteSettings.deleteByKey(key);
    if (result.numDeletedRows === 0n) {
      throw new AppError(404, "NOT_FOUND", `Setting "${key}" not found`);
    }

    return c.body(null, 204);
  });
