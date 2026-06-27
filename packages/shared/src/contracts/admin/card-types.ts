import { withParams } from "@openrift/shared/schemas";
import { oc } from "@orpc/contract";
import { z } from "zod";

import { slugRegex } from "./shared.js";

const TAG = "Admin - Card Types";

const BASE = "/api/admin/v1/card-types";

const entitySchema = z.object({
  slug: z.string(),
  label: z.string(),
  sortOrder: z.number(),
  isWellKnown: z.boolean(),
});

const slugParamSchema = z.object({ slug: z.string().min(1) });

/**
 * oRPC contract for the admin card type taxonomy CRUD (mounted at
 * `/api/admin/v1/card-types`, admin-gated by the mount). Conflict / not-found /
 * bad-request states are thrown as `AppError` and bridged to ORPCErrors in the
 * implementation. The static `reorder` path precedes `{slug}`.
 */
export const adminCardTypesContract = {
  list: oc
    .route({ method: "GET", path: BASE, tags: [TAG] })
    .output(z.object({ cardTypes: z.array(entitySchema) })),
  reorder: oc
    .route({ method: "PUT", path: `${BASE}/reorder`, tags: [TAG], successStatus: 204 })
    .input(z.object({ slugs: z.array(z.string().min(1)).min(1) })),
  create: oc
    .route({ method: "POST", path: BASE, tags: [TAG], successStatus: 201 })
    .input(
      z.object({
        slug: z.string().min(1).regex(slugRegex, "Slug must be kebab-case"),
        label: z.string().min(1),
      }),
    )
    .output(z.object({ cardType: entitySchema })),
  update: oc
    .route({ method: "PATCH", path: `${BASE}/{slug}`, tags: [TAG], successStatus: 204 })
    .input(withParams(slugParamSchema, { label: z.string().min(1).optional() })),
  remove: oc
    .route({ method: "DELETE", path: `${BASE}/{slug}`, tags: [TAG], successStatus: 204 })
    .input(slugParamSchema),
};

export type AdminCardTypesContract = typeof adminCardTypesContract;
export interface AdminCardTypesResponse {
  cardTypes: z.infer<typeof entitySchema>[];
}
