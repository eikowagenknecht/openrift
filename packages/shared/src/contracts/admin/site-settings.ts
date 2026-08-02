import { isoDateTime } from "@openrift/shared/schemas";
import { z } from "zod";

import { authedRoute } from "../_base.js";

const TAG = "Admin - Site Settings";

const SS = "/api/admin/v1/site-settings";

export const scopeEnum = z.enum(["web", "api"]);

export const siteSettingSchema = z.object({
  key: z.string(),
  value: z.string(),
  scope: z.string(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

/**
 * oRPC contract for the admin site-settings CRUD (mounted at
 * `/api/admin/v1/site-settings`, admin-gated by the mount). Settings are keyed
 * by `key`. All procedures are session-gated (UNAUTHORIZED + FORBIDDEN from
 * `authedRoute`). Domain codes per route: `create` → CONFLICT (key already
 * exists); `update` → NOT_FOUND; `remove` → NOT_FOUND.
 */
export const adminSiteSettingsContract = {
  list: authedRoute
    .route({ method: "GET", path: SS, tags: [TAG] })
    .output(z.object({ settings: z.array(siteSettingSchema) })),
  create: authedRoute
    .route({ method: "POST", path: SS, tags: [TAG], successStatus: 201 })
    .errors({ CONFLICT: { message: "Setting already exists" } })
    .input(
      z.object({
        key: z
          .string()
          .regex(/^[a-z][a-z0-9]+(?:-[a-z0-9]+)*$/u, "Key must be kebab-case (e.g. umami-url)"),
        value: z.string(),
        scope: scopeEnum.optional(),
      }),
    ),
  update: authedRoute
    .route({ method: "PATCH", path: `${SS}/{key}`, tags: [TAG], successStatus: 204 })
    .errors({ NOT_FOUND: { message: "Setting not found" } })
    .input(
      z
        .object({
          key: z.string().min(1),
          value: z.string().optional(),
          scope: scopeEnum.optional(),
        })
        .refine((o) => o.value !== undefined || o.scope !== undefined, {
          message: "At least one field (value, scope) must be provided",
        }),
    ),
  remove: authedRoute
    .route({ method: "DELETE", path: `${SS}/{key}`, tags: [TAG], successStatus: 204 })
    .errors({ NOT_FOUND: { message: "Setting not found" } })
    .input(z.object({ key: z.string().min(1) })),
};

export type AdminSiteSettingsContract = typeof adminSiteSettingsContract;
export interface AdminSiteSettingsResponse {
  settings: z.infer<typeof siteSettingSchema>[];
}
