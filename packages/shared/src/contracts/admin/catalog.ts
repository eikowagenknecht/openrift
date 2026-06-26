import { idParamSchema, isoDate } from "@openrift/shared/schemas";
import { oc } from "@orpc/contract";
import { z } from "zod";

const TAG = "Admin - Catalog";

const SETS = "/api/admin/v1/sets";

// Mirrors the API-only `setFieldRules` (apps/api db/schemas) — only the API
// touches the `sets` table.
const setFieldRules = {
  slug: z.string().min(1),
  name: z.string().min(1),
  printedTotal: z.number().int().min(0).nullable(),
  setType: z.enum(["main", "supplemental"]),
};

const adminSetSchema = z.object({
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
 * delete sets and reorder them. Conflict / not-found / bad-request states are
 * thrown as `AppError` and bridged to ORPCErrors.
 */
export const adminCatalogContract = {
  listSets: oc
    .route({ method: "GET", path: SETS, tags: [TAG] })
    .output(z.object({ sets: z.array(adminSetSchema) })),
  updateSet: oc
    .route({ method: "PATCH", path: `${SETS}/{id}`, tags: [TAG], successStatus: 204 })
    .input(
      idParamSchema.extend({
        name: setFieldRules.name,
        printedTotal: setFieldRules.printedTotal,
        releasedAt: isoDate.nullable(),
        released: z.boolean(),
        setType: setFieldRules.setType,
      }),
    ),
  createSet: oc
    .route({ method: "POST", path: SETS, tags: [TAG], successStatus: 201 })
    .input(
      z.object({
        id: setFieldRules.slug,
        name: setFieldRules.name,
        printedTotal: setFieldRules.printedTotal,
        releasedAt: isoDate.nullable().optional(),
      }),
    )
    .output(z.object({ id: z.string() })),
  deleteSet: oc
    .route({ method: "DELETE", path: `${SETS}/{id}`, tags: [TAG], successStatus: 204 })
    .input(idParamSchema),
  reorderSets: oc
    .route({ method: "PUT", path: `${SETS}/reorder`, tags: [TAG], successStatus: 204 })
    .input(z.object({ ids: z.array(z.uuid()).min(1) })),
};

export type AdminCatalogContract = typeof adminCatalogContract;
export interface AdminSetsResponse {
  sets: z.infer<typeof adminSetSchema>[];
}
