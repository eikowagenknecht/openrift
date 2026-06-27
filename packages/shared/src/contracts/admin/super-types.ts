import { withParams } from "@openrift/shared/schemas";
import { z } from "zod";

import { authedRoute } from "../_base.js";
import { slugRegex } from "./shared.js";

const TAG = "Admin - Supertypes";

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
 * `/api/admin/v1/super-types`, admin-gated by the mount). All procedures are
 * session-gated (UNAUTHORIZED + FORBIDDEN from `authedRoute`). Domain codes per
 * route: `reorder` → BAD_REQUEST (invalid reorder request); `create` → CONFLICT
 * (slug already in use); `update` → NOT_FOUND; `remove` → NOT_FOUND + CONFLICT
 * (well-known or in use).
 */
export const adminSuperTypesContract = {
  list: authedRoute
    .route({ method: "GET", path: BASE, tags: [TAG] })
    .output(z.object({ superTypes: z.array(entitySchema) })),
  reorder: authedRoute
    .route({ method: "PUT", path: `${BASE}/reorder`, tags: [TAG], successStatus: 204 })
    .errors({ BAD_REQUEST: { message: "Invalid reorder request" } })
    .input(z.object({ slugs: z.array(z.string().min(1)).min(1) })),
  create: authedRoute
    .route({ method: "POST", path: BASE, tags: [TAG], successStatus: 201 })
    .errors({ CONFLICT: { message: "Supertype already exists" } })
    .input(
      z.object({
        slug: z.string().min(1).regex(slugRegex, "Slug must be kebab-case"),
        label: z.string().min(1),
      }),
    )
    .output(z.object({ superType: entitySchema })),
  update: authedRoute
    .route({ method: "PATCH", path: `${BASE}/{slug}`, tags: [TAG], successStatus: 204 })
    .errors({ NOT_FOUND: { message: "Supertype not found" } })
    .input(withParams(slugParamSchema, { label: z.string().min(1).optional() })),
  remove: authedRoute
    .route({ method: "DELETE", path: `${BASE}/{slug}`, tags: [TAG], successStatus: 204 })
    .errors({
      NOT_FOUND: { message: "Supertype not found" },
      CONFLICT: { message: "Supertype cannot be deleted" },
    })
    .input(slugParamSchema),
};

export type AdminSuperTypesContract = typeof adminSuperTypesContract;
export interface AdminSuperTypesResponse {
  superTypes: z.infer<typeof entitySchema>[];
}
