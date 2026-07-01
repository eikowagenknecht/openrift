import { idParamSchema, isoDate, withParams } from "@openrift/shared/schemas";
import { z } from "zod";

import { WellKnown } from "../../well-known.js";
import { authedRoute } from "../_base.js";

const TAG = "Admin - Catalog";

const SETS = "/api/admin/v1/sets";

// Mirrors the API-only `setFieldRules` (apps/api db/schemas) — only the API
// touches the `sets` table.
const setFieldRules = {
  slug: z.string().min(1),
  name: z.string().min(1),
  printedTotal: z.number().int().min(0).nullable(),
  setType: z.enum([WellKnown.setType.MAIN, WellKnown.setType.SUPPLEMENTAL]),
};

export const adminSetSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  printedTotal: z.number().nullable(),
  sortOrder: z.number(),
  releasedAt: isoDate.nullable(),
  released: z.boolean(),
  setType: setFieldRules.setType,
  cardCount: z.number(),
  printingCount: z.number(),
});

/**
 * oRPC contract for the admin set (catalog) management (mounted under
 * `/api/admin/v1/sets`, admin-gated by the mount): list / create / update /
 * delete sets and reorder them. Domain codes per route: `updateSet` → NOT_FOUND;
 * `createSet` → CONFLICT (slug already exists); `deleteSet` → CONFLICT (set
 * still has printings); `reorderSets` → BAD_REQUEST (invalid id list).
 */
export const adminCatalogContract = {
  listSets: authedRoute
    .route({ method: "GET", path: SETS, tags: [TAG] })
    .output(z.object({ sets: z.array(adminSetSchema) })),
  updateSet: authedRoute
    .route({ method: "PATCH", path: `${SETS}/{id}`, tags: [TAG], successStatus: 204 })
    .errors({ NOT_FOUND: { message: "Set not found" } })
    .input(
      withParams(idParamSchema, {
        name: setFieldRules.name,
        printedTotal: setFieldRules.printedTotal,
        releasedAt: isoDate.nullable(),
        released: z.boolean(),
        setType: setFieldRules.setType,
      }),
    ),
  createSet: authedRoute
    .route({ method: "POST", path: SETS, tags: [TAG], successStatus: 201 })
    .errors({ CONFLICT: { message: "Set already exists" } })
    .input(
      z.object({
        id: setFieldRules.slug,
        name: setFieldRules.name,
        printedTotal: setFieldRules.printedTotal,
        releasedAt: isoDate.nullable().optional(),
      }),
    )
    .output(z.object({ id: z.string() })),
  deleteSet: authedRoute
    .route({ method: "DELETE", path: `${SETS}/{id}`, tags: [TAG], successStatus: 204 })
    .errors({ CONFLICT: { message: "Set still has printings and cannot be deleted" } })
    .input(idParamSchema),
  reorderSets: authedRoute
    .route({ method: "PUT", path: `${SETS}/reorder`, tags: [TAG], successStatus: 204 })
    .errors({ BAD_REQUEST: { message: "Invalid reorder request" } })
    .input(z.object({ ids: z.array(z.uuid()).min(1) })),
};

export type AdminCatalogContract = typeof adminCatalogContract;
export interface AdminSetsResponse {
  sets: z.infer<typeof adminSetSchema>[];
}
