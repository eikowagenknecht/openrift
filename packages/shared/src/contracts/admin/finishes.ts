import { withParams } from "@openrift/shared/schemas";
import { z } from "zod";

import { authedRoute } from "../_base.js";
import { slugRegex } from "./shared.js";

const TAG = "Admin - Finishes";

const BASE = "/api/admin/v1/finishes";

const entitySchema = z.object({
  slug: z.string(),
  label: z.string(),
  sortOrder: z.number(),
  isWellKnown: z.boolean(),
});

const slugParamSchema = z.object({ slug: z.string().min(1) });

/**
 * oRPC contract for the admin finish taxonomy CRUD (mounted at
 * `/api/admin/v1/finishes`, admin-gated by the mount). All procedures share
 * the `authedRoute` base (UNAUTHORIZED + FORBIDDEN). Domain codes per route:
 * `reorder` → BAD_REQUEST (invalid slugs); `create` → CONFLICT (slug taken);
 * `update` → NOT_FOUND; `remove` → NOT_FOUND + CONFLICT (well-known or in
 * use). The static `reorder` path precedes `{slug}`.
 */
export const adminFinishesContract = {
  list: authedRoute
    .route({ method: "GET", path: BASE, tags: [TAG] })
    .output(z.object({ finishes: z.array(entitySchema) })),
  reorder: authedRoute
    .route({ method: "PUT", path: `${BASE}/reorder`, tags: [TAG], successStatus: 204 })
    .errors({ BAD_REQUEST: { message: "Invalid or incomplete list of finish slugs" } })
    .input(z.object({ slugs: z.array(z.string().min(1)).min(1) })),
  create: authedRoute
    .route({ method: "POST", path: BASE, tags: [TAG], successStatus: 201 })
    .errors({ CONFLICT: { message: "A finish with that slug already exists" } })
    .input(
      z.object({
        slug: z.string().min(1).regex(slugRegex, "Slug must be kebab-case"),
        label: z.string().min(1),
      }),
    )
    .output(z.object({ finish: entitySchema })),
  update: authedRoute
    .route({ method: "PATCH", path: `${BASE}/{slug}`, tags: [TAG], successStatus: 204 })
    .errors({ NOT_FOUND: { message: "Finish not found" } })
    .input(withParams(slugParamSchema, { label: z.string().min(1).optional() })),
  remove: authedRoute
    .route({ method: "DELETE", path: `${BASE}/{slug}`, tags: [TAG], successStatus: 204 })
    .errors({
      NOT_FOUND: { message: "Finish not found" },
      CONFLICT: { message: "Finish is well-known or in use by one or more printings" },
    })
    .input(slugParamSchema),
};

export type AdminFinishesContract = typeof adminFinishesContract;
export interface AdminFinishesResponse {
  finishes: z.infer<typeof entitySchema>[];
}
