import { withParams } from "@openrift/shared/schemas";
import { oc } from "@orpc/contract";
import { z } from "zod";

const TAG = "Admin - Deck Zones";

const DZ = "/api/admin/v1/deck-zones";

const deckZoneSchema = z.object({
  slug: z.string(),
  label: z.string(),
  sortOrder: z.number(),
  isWellKnown: z.boolean(),
});

const slugParamSchema = z.object({ slug: z.string().min(1) });

/**
 * oRPC contract for the admin deck-zones taxonomy (mounted at
 * `/api/admin/v1/deck-zones`, admin-gated by the mount). Deck zones are a fixed
 * set — only list / reorder / relabel are exposed (no create or delete).
 * Not-found / bad-request states are thrown as `AppError` and bridged to
 * ORPCErrors in the implementation. The static `reorder` path precedes
 * `{slug}`.
 */
export const adminDeckZonesContract = {
  list: oc
    .route({ method: "GET", path: DZ, tags: [TAG] })
    .output(z.object({ deckZones: z.array(deckZoneSchema) })),
  reorder: oc
    .route({ method: "PUT", path: `${DZ}/reorder`, tags: [TAG], successStatus: 204 })
    .input(z.object({ slugs: z.array(z.string().min(1)).min(1) })),
  update: oc
    .route({ method: "PATCH", path: `${DZ}/{slug}`, tags: [TAG], successStatus: 204 })
    .input(withParams(slugParamSchema, { label: z.string().min(1).optional() })),
};

export type AdminDeckZonesContract = typeof adminDeckZonesContract;
export interface AdminDeckZonesResponse {
  deckZones: z.infer<typeof deckZoneSchema>[];
}
