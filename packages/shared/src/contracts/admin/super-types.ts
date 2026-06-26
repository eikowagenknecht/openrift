import { oc } from "@orpc/contract";
import { z } from "zod";

const TAG = "Admin - Super Types";

const BASE = "/api/admin/v1/super-types";

const entitySchema = z.object({
  slug: z.string(),
  label: z.string(),
  sortOrder: z.number(),
  isWellKnown: z.boolean(),
});

const slugParamSchema = z.object({ slug: z.string().min(1) });

/**
 * oRPC contract for the admin super type taxonomy CRUD (mounted at
 * `/api/admin/v1/super-types`, admin-gated by the mount). Conflict / not-found /
 * bad-request states are thrown as `AppError` and bridged to ORPCErrors in the
 * implementation. The static `reorder` path precedes `{slug}`.
 */
export const adminSuperTypesContract = {
  list: oc
    .route({ method: "GET", path: BASE, tags: [TAG] })
    .output(z.object({ superTypes: z.array(entitySchema) })),
  reorder: oc
    .route({ method: "PUT", path: `${BASE}/reorder`, tags: [TAG], successStatus: 204 })
    .input(z.object({ slugs: z.array(z.string().min(1)).min(1) })),
  create: oc
    .route({ method: "POST", path: BASE, tags: [TAG], successStatus: 201 })
    .input(
      z.object({
        slug: z
          .string()
          .min(1)
          .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u, "Slug must be kebab-case"),
        label: z.string().min(1),
      }),
    )
    .output(z.object({ superType: entitySchema })),
  update: oc
    .route({ method: "PATCH", path: `${BASE}/{slug}`, tags: [TAG], successStatus: 204 })
    .input(slugParamSchema.extend({ label: z.string().min(1).optional() })),
  remove: oc
    .route({ method: "DELETE", path: `${BASE}/{slug}`, tags: [TAG], successStatus: 204 })
    .input(slugParamSchema),
};

export type AdminSuperTypesContract = typeof adminSuperTypesContract;
export interface AdminSuperTypesResponse {
  superTypes: z.infer<typeof entitySchema>[];
}
