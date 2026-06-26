import { oc } from "@orpc/contract";
import { z } from "zod";

const TAG = "Admin - Site Settings";

const SS = "/api/admin/v1/site-settings";

const scopeEnum = z.enum(["web", "api"]);

const siteSettingSchema = z.object({
  key: z.string(),
  value: z.string(),
  scope: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/**
 * oRPC contract for the admin site-settings CRUD (mounted at
 * `/api/admin/v1/site-settings`, admin-gated by the mount). Settings are keyed
 * by `key`. Conflict / not-found states are thrown as `AppError` and bridged to
 * ORPCErrors in the implementation.
 */
export const adminSiteSettingsContract = {
  list: oc
    .route({ method: "GET", path: SS, tags: [TAG] })
    .output(z.object({ settings: z.array(siteSettingSchema) })),
  create: oc.route({ method: "POST", path: SS, tags: [TAG], successStatus: 201 }).input(
    z.object({
      key: z
        .string()
        .regex(/^[a-z][a-z0-9]+(?:-[a-z0-9]+)*$/u, "Key must be kebab-case (e.g. umami-url)"),
      value: z.string(),
      scope: scopeEnum.optional(),
    }),
  ),
  update: oc.route({ method: "PATCH", path: `${SS}/{key}`, tags: [TAG], successStatus: 204 }).input(
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
  remove: oc
    .route({ method: "DELETE", path: `${SS}/{key}`, tags: [TAG], successStatus: 204 })
    .input(z.object({ key: z.string().min(1) })),
};

export type AdminSiteSettingsContract = typeof adminSiteSettingsContract;
export interface AdminSiteSettingsResponse {
  settings: z.infer<typeof siteSettingSchema>[];
}
