import { withParams } from "@openrift/shared/schemas";
import { oc } from "@orpc/contract";
import { z } from "zod";

import { slugRegex } from "./shared.js";

const TAG = "Admin - Art Variants";

const AV = "/api/admin/v1/art-variants";

const artVariantSchema = z.object({
  slug: z.string(),
  label: z.string(),
  sortOrder: z.number(),
  isWellKnown: z.boolean(),
});

const slugParamSchema = z.object({ slug: z.string().min(1) });

/**
 * oRPC contract for the admin art-variants taxonomy CRUD (mounted at
 * `/api/admin/v1/art-variants`, admin-gated by the mount). Conflict / not-found
 * / bad-request states are thrown as `AppError` and bridged to ORPCErrors in
 * the implementation. The static `reorder` path precedes `{slug}`.
 */
export const adminArtVariantsContract = {
  list: oc
    .route({ method: "GET", path: AV, tags: [TAG] })
    .output(z.object({ artVariants: z.array(artVariantSchema) })),
  reorder: oc
    .route({ method: "PUT", path: `${AV}/reorder`, tags: [TAG], successStatus: 204 })
    .input(z.object({ slugs: z.array(z.string().min(1)).min(1) })),
  create: oc
    .route({ method: "POST", path: AV, tags: [TAG], successStatus: 201 })
    .input(
      z.object({
        slug: z.string().min(1).regex(slugRegex, "Slug must be kebab-case"),
        label: z.string().min(1),
      }),
    )
    .output(z.object({ artVariant: artVariantSchema })),
  update: oc
    .route({ method: "PATCH", path: `${AV}/{slug}`, tags: [TAG], successStatus: 204 })
    .input(withParams(slugParamSchema, { label: z.string().min(1).optional() })),
  remove: oc
    .route({ method: "DELETE", path: `${AV}/{slug}`, tags: [TAG], successStatus: 204 })
    .input(slugParamSchema),
};

export type AdminArtVariantsContract = typeof adminArtVariantsContract;
export interface AdminArtVariantsResponse {
  artVariants: z.infer<typeof artVariantSchema>[];
}
