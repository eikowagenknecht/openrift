import { withParams } from "@openrift/shared/schemas";
import { z } from "zod";

import { authedRoute } from "../_base.js";
import { slugRegex } from "./shared.js";

const TAG = "Admin - Card Types";

const BASE = "/api/admin/v1/card-types";

const entitySchema = z.object({
  slug: z.string(),
  label: z.string(),
  sortOrder: z.number(),
  isWellKnown: z.boolean(),
});

const slugParamSchema = z.object({ slug: z.string().min(1) });

/** The literal `reorder` path must precede `{slug}` in route registration order. */
export const adminCardTypesContract = {
  list: authedRoute
    .route({ method: "GET", path: BASE, tags: [TAG] })
    .output(z.object({ cardTypes: z.array(entitySchema) })),
  reorder: authedRoute
    .route({ method: "PUT", path: `${BASE}/reorder`, tags: [TAG], successStatus: 204 })
    .errors({ BAD_REQUEST: { message: "Invalid reorder request" } })
    .input(z.object({ slugs: z.array(z.string().min(1)).min(1) })),
  create: authedRoute
    .route({ method: "POST", path: BASE, tags: [TAG], successStatus: 201 })
    .errors({ CONFLICT: { message: "Card type already exists" } })
    .input(
      z.object({
        slug: z.string().min(1).regex(slugRegex, "Slug must be kebab-case"),
        label: z.string().min(1),
      }),
    )
    .output(z.object({ cardType: entitySchema })),
  update: authedRoute
    .route({ method: "PATCH", path: `${BASE}/{slug}`, tags: [TAG], successStatus: 204 })
    .errors({ NOT_FOUND: { message: "Card type not found" } })
    .input(withParams(slugParamSchema, { label: z.string().min(1).optional() })),
  remove: authedRoute
    .route({ method: "DELETE", path: `${BASE}/{slug}`, tags: [TAG], successStatus: 204 })
    .errors({
      NOT_FOUND: { message: "Card type not found" },
      CONFLICT: { message: "Card type cannot be deleted" },
    })
    .input(slugParamSchema),
};

export type AdminCardTypesContract = typeof adminCardTypesContract;
export interface AdminCardTypesResponse {
  cardTypes: z.infer<typeof entitySchema>[];
}
