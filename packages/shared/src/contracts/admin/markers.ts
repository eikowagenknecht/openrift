import { oc } from "@orpc/contract";
import { z } from "zod";

import { slugRegex } from "./shared.js";

const TAG = "Admin - Markers";

const MARKERS = "/api/admin/v1/markers";

const markerSchema = z.object({
  id: z.string(),
  slug: z.string(),
  label: z.string(),
  description: z.string().nullable(),
  sortOrder: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const idParamSchema = z.object({ id: z.uuid() });

/**
 * oRPC contract for the admin markers taxonomy CRUD (mounted at
 * `/api/admin/v1/markers`, admin-gated by the mount). Markers are keyed by
 * their UUID `id`. Conflict / not-found / in-use states are thrown as
 * `AppError` and bridged to ORPCErrors in the implementation. The static
 * `reorder` path precedes `{id}`.
 */
export const adminMarkersContract = {
  list: oc
    .route({ method: "GET", path: MARKERS, tags: [TAG] })
    .output(z.object({ markers: z.array(markerSchema) })),
  reorder: oc
    .route({ method: "PUT", path: `${MARKERS}/reorder`, tags: [TAG], successStatus: 204 })
    .input(z.object({ ids: z.array(z.string().min(1)).min(1) })),
  create: oc
    .route({ method: "POST", path: MARKERS, tags: [TAG], successStatus: 201 })
    .input(
      z.object({
        slug: z.string().min(1).regex(slugRegex, "Slug must be kebab-case (e.g. top-8)"),
        label: z.string().min(1),
        description: z.string().min(1).nullable().optional(),
      }),
    )
    .output(z.object({ marker: markerSchema })),
  update: oc
    .route({ method: "PATCH", path: `${MARKERS}/{id}`, tags: [TAG], successStatus: 204 })
    .input(
      idParamSchema.extend({
        slug: z.string().min(1).regex(slugRegex, "Slug must be kebab-case").optional(),
        label: z.string().min(1).optional(),
        description: z.string().min(1).nullable().optional(),
      }),
    ),
  remove: oc
    .route({ method: "DELETE", path: `${MARKERS}/{id}`, tags: [TAG], successStatus: 204 })
    .input(idParamSchema),
};

export type AdminMarkersContract = typeof adminMarkersContract;
export interface AdminMarkersResponse {
  markers: z.infer<typeof markerSchema>[];
}
