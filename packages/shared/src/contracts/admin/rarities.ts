import { withParams } from "@openrift/shared/schemas";
import { z } from "zod";

import { authedRoute } from "../_base.js";

const TAG = "Admin - Rarities";

const BASE = "/api/admin/v1/rarities";

const entitySchema = z.object({
  slug: z.string(),
  label: z.string(),
  sortOrder: z.number(),
  isWellKnown: z.boolean(),
  color: z.string().nullable(),
});

const slugParamSchema = z.object({ slug: z.string().min(1) });

const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/u)
  .nullable();

/**
 * oRPC contract for the admin rarity taxonomy CRUD (mounted at
 * `/api/admin/v1/rarities`, admin-gated by the mount). Like the other enum
 * taxonomies but each row also carries an optional hex `color`. All procedures
 * are session-gated (UNAUTHORIZED + FORBIDDEN from `authedRoute`). Domain codes
 * per route: `reorder` → BAD_REQUEST (invalid reorder request); `create` →
 * CONFLICT (slug already in use); `update` → NOT_FOUND; `remove` → NOT_FOUND +
 * CONFLICT (well-known or in use).
 */
export const adminRaritiesContract = {
  list: authedRoute
    .route({ method: "GET", path: BASE, tags: [TAG] })
    .output(z.object({ rarities: z.array(entitySchema) })),
  reorder: authedRoute
    .route({ method: "PUT", path: `${BASE}/reorder`, tags: [TAG], successStatus: 204 })
    .errors({ BAD_REQUEST: { message: "Invalid reorder request" } })
    .input(z.object({ slugs: z.array(z.string().min(1)).min(1) })),
  create: authedRoute
    .route({ method: "POST", path: BASE, tags: [TAG], successStatus: 201 })
    .errors({ CONFLICT: { message: "Rarity already exists" } })
    .input(
      z.object({
        slug: z.string().min(1),
        label: z.string().min(1),
        color: hexColorSchema.optional(),
      }),
    )
    .output(z.object({ rarity: entitySchema })),
  update: authedRoute
    .route({ method: "PATCH", path: `${BASE}/{slug}`, tags: [TAG], successStatus: 204 })
    .errors({ NOT_FOUND: { message: "Rarity not found" } })
    .input(
      withParams(slugParamSchema, {
        label: z.string().min(1).optional(),
        color: hexColorSchema.optional(),
      }),
    ),
  remove: authedRoute
    .route({ method: "DELETE", path: `${BASE}/{slug}`, tags: [TAG], successStatus: 204 })
    .errors({
      NOT_FOUND: { message: "Rarity not found" },
      CONFLICT: { message: "Rarity cannot be deleted" },
    })
    .input(slugParamSchema),
};

export type AdminRaritiesContract = typeof adminRaritiesContract;
export interface AdminRaritiesResponse {
  rarities: z.infer<typeof entitySchema>[];
}
