import { idParamSchema, isoDateTime, withParams } from "@openrift/shared/schemas";
import { z } from "zod";

import { authedRoute } from "../_base.js";
import { slugRegex } from "./shared.js";

const TAG = "Admin - Markers";

const MARKERS = "/api/admin/v1/markers";

export const markerSchema = z.object({
  id: z.string(),
  slug: z.string(),
  label: z.string(),
  description: z.string().nullable(),
  sortOrder: z.number(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

/**
 * Admin-gated by the mount, not enforced here. The static `reorder` path
 * must precede `{id}` for routing to match it.
 */
export const adminMarkersContract = {
  list: authedRoute
    .route({ method: "GET", path: MARKERS, tags: [TAG] })
    .output(z.object({ markers: z.array(markerSchema) })),
  reorder: authedRoute
    .route({ method: "PUT", path: `${MARKERS}/reorder`, tags: [TAG], successStatus: 204 })
    .errors({ BAD_REQUEST: { message: "Invalid or incomplete list of marker ids" } })
    .input(z.object({ ids: z.array(z.string().min(1)).min(1) })),
  create: authedRoute
    .route({ method: "POST", path: MARKERS, tags: [TAG], successStatus: 201 })
    .errors({ CONFLICT: { message: "A marker with that slug already exists" } })
    .input(
      z.object({
        slug: z.string().min(1).regex(slugRegex, "Slug must be kebab-case (e.g. top-8)"),
        label: z.string().min(1),
        description: z.string().min(1).nullable().optional(),
      }),
    )
    .output(z.object({ marker: markerSchema })),
  update: authedRoute
    .route({ method: "PATCH", path: `${MARKERS}/{id}`, tags: [TAG], successStatus: 204 })
    .errors({
      NOT_FOUND: { message: "Marker not found" },
      CONFLICT: { message: "A marker with that slug already exists" },
    })
    .input(
      withParams(idParamSchema, {
        slug: z.string().min(1).regex(slugRegex, "Slug must be kebab-case").optional(),
        label: z.string().min(1).optional(),
        description: z.string().min(1).nullable().optional(),
      }),
    ),
  remove: authedRoute
    .route({ method: "DELETE", path: `${MARKERS}/{id}`, tags: [TAG], successStatus: 204 })
    .errors({
      NOT_FOUND: { message: "Marker not found" },
      CONFLICT: { message: "Marker is in use by one or more printings" },
    })
    .input(idParamSchema),
};

export type AdminMarkersContract = typeof adminMarkersContract;
export interface AdminMarkersResponse {
  markers: z.infer<typeof markerSchema>[];
}
