import { setFieldRules } from "@openrift/shared/db-field-rules";
import { idParamSchema, isoDate, withParams } from "@openrift/shared/schemas";
import { z } from "zod";

import { authedRoute } from "../_base.js";

const TAG = "Admin - Catalog";

const SETS = "/api/admin/v1/sets";

// Coarse precisions must carry the first day of their period — the same
// invariant the `set_releases` CHECK enforces.
const setReleaseInputSchema = z
  .object({
    releasedAt: isoDate.nullable(),
    precision: z.enum(["day", "month", "quarter", "year"]).nullable(),
  })
  .refine((value) => (value.releasedAt === null) === (value.precision === null), {
    message: "releasedAt and precision must both be set or both be null",
  })
  .refine(
    (value) => {
      if (!value.releasedAt || !value.precision || value.precision === "day") {
        return true;
      }
      const month = Number(value.releasedAt.slice(5, 7));
      const day = Number(value.releasedAt.slice(8, 10));
      if (value.precision === "year") {
        return month === 1 && day === 1;
      }
      if (value.precision === "quarter") {
        return day === 1 && [1, 4, 7, 10].includes(month);
      }
      return day === 1;
    },
    { message: "releasedAt must be the first day of its period" },
  );

const setReleasesSchema = z.record(z.string().min(1), setReleaseInputSchema);

export const adminSetSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  printedTotal: z.number().nullable(),
  sortOrder: z.number(),
  releases: setReleasesSchema,
  setType: setFieldRules.setType,
  cardCount: z.number(),
  printingCount: z.number(),
});

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
        releases: setReleasesSchema,
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
        releases: setReleasesSchema.optional(),
        setType: setFieldRules.setType,
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
