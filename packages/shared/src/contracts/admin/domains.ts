import { withParams } from "@openrift/shared/schemas";
import { z } from "zod";

import { authedRoute } from "../_base.js";
import { slugRegex } from "./shared.js";

const TAG = "Admin - Domains";

const BASE = "/api/admin/v1/domains";

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
 * Admin domain taxonomy CRUD, mounted at `/api/admin/v1/domains`. The static
 * `reorder` path must precede `{slug}`.
 */
export const adminDomainsContract = {
  list: authedRoute
    .route({ method: "GET", path: BASE, tags: [TAG] })
    .output(z.object({ domains: z.array(entitySchema) })),
  reorder: authedRoute
    .route({ method: "PUT", path: `${BASE}/reorder`, tags: [TAG], successStatus: 204 })
    .errors({ BAD_REQUEST: { message: "Invalid or incomplete list of domain slugs" } })
    .input(z.object({ slugs: z.array(z.string().min(1)).min(1) })),
  create: authedRoute
    .route({ method: "POST", path: BASE, tags: [TAG], successStatus: 201 })
    .errors({ CONFLICT: { message: "A domain with that slug already exists" } })
    .input(
      z.object({
        slug: z.string().min(1).regex(slugRegex, "Slug must be kebab-case"),
        label: z.string().min(1),
        color: hexColorSchema.optional(),
      }),
    )
    .output(z.object({ domain: entitySchema })),
  update: authedRoute
    .route({ method: "PATCH", path: `${BASE}/{slug}`, tags: [TAG], successStatus: 204 })
    .errors({ NOT_FOUND: { message: "Domain not found" } })
    .input(
      withParams(slugParamSchema, {
        label: z.string().min(1).optional(),
        color: hexColorSchema.optional(),
      }),
    ),
  remove: authedRoute
    .route({ method: "DELETE", path: `${BASE}/{slug}`, tags: [TAG], successStatus: 204 })
    .errors({
      NOT_FOUND: { message: "Domain not found" },
      CONFLICT: { message: "Domain is well-known or in use by one or more cards" },
    })
    .input(slugParamSchema),
};

export type AdminDomainsContract = typeof adminDomainsContract;
export interface AdminDomainsResponse {
  domains: z.infer<typeof entitySchema>[];
}
