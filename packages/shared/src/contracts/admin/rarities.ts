import { oc } from "@orpc/contract";
import { z } from "zod";

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
 * taxonomies but each row also carries an optional hex `color`. Conflict /
 * not-found / bad-request states are thrown as `AppError` and bridged to
 * ORPCErrors in the implementation. The static `reorder` path precedes `{slug}`.
 */
export const adminRaritiesContract = {
  list: oc
    .route({ method: "GET", path: BASE, tags: [TAG] })
    .output(z.object({ rarities: z.array(entitySchema) })),
  reorder: oc
    .route({ method: "PUT", path: `${BASE}/reorder`, tags: [TAG], successStatus: 204 })
    .input(z.object({ slugs: z.array(z.string().min(1)).min(1) })),
  create: oc
    .route({ method: "POST", path: BASE, tags: [TAG], successStatus: 201 })
    .input(
      z.object({
        slug: z.string().min(1),
        label: z.string().min(1),
        color: hexColorSchema.optional(),
      }),
    )
    .output(z.object({ rarity: entitySchema })),
  update: oc
    .route({ method: "PATCH", path: `${BASE}/{slug}`, tags: [TAG], successStatus: 204 })
    .input(
      slugParamSchema.extend({
        label: z.string().min(1).optional(),
        color: hexColorSchema.optional(),
      }),
    ),
  remove: oc
    .route({ method: "DELETE", path: `${BASE}/{slug}`, tags: [TAG], successStatus: 204 })
    .input(slugParamSchema),
};

export type AdminRaritiesContract = typeof adminRaritiesContract;
export interface AdminRaritiesResponse {
  rarities: z.infer<typeof entitySchema>[];
}
