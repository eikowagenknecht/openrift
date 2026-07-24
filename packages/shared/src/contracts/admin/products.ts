import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { idParamSchema, withParams } from "@openrift/shared/schemas";
import { z } from "zod";

import { authedRoute } from "../_base.js";
import { productSlugSchema, productSummarySchema } from "../products.js";

extendZodWithOpenApi(z);

const TAG = "Admin - Products";

const PRODUCTS = "/api/admin/v1/products";

const createProductInput = z.object({
  slug: productSlugSchema,
  name: z.string().min(1).max(120),
  description: z.string().min(1).max(2000).nullable().optional(),
  /** The set the product released with, or null for cross-set products. */
  setId: z.uuid().nullable().optional(),
  /** The admin's own printing-kind list whose resolved entries become the contents. */
  listId: z.uuid(),
});

const updateProductInput = z.object({
  slug: productSlugSchema.optional(),
  name: z.string().min(1).max(120).optional(),
  description: z.string().min(1).max(2000).nullable().optional(),
  setId: z.uuid().nullable().optional(),
});

/**
 * oRPC contract for admin product management (ADR-015, mounted under
 * `/api/admin/v1`, admin-gated by the mount; grantable section "products").
 * Contents are only ever written by snapshotting a list: `create` snapshots at
 * creation, `resyncContents` re-runs the snapshot as a wholesale replace.
 * There is no row-by-row content editing. Domain codes: `create` → CONFLICT
 * (slug) + NOT_FOUND (list) + BAD_REQUEST (list not snapshottable);
 * `resyncContents` → NOT_FOUND (product or list) + BAD_REQUEST; `update` →
 * NOT_FOUND + CONFLICT; `remove` → NOT_FOUND.
 */
export const adminProductsContract = {
  create: authedRoute
    .route({ method: "POST", path: PRODUCTS, tags: [TAG], successStatus: 201 })
    .errors({
      CONFLICT: { message: "Slug already in use" },
      NOT_FOUND: { message: "List not found" },
      BAD_REQUEST: { message: "List cannot be snapshotted" },
    })
    .input(createProductInput)
    .output(z.object({ product: productSummarySchema })),
  resyncContents: authedRoute
    .route({ method: "PUT", path: `${PRODUCTS}/{id}/contents`, tags: [TAG], successStatus: 204 })
    .errors({
      NOT_FOUND: { message: "Product or list not found" },
      BAD_REQUEST: { message: "List cannot be snapshotted" },
    })
    .input(withParams(idParamSchema, { listId: z.uuid() })),
  update: authedRoute
    .route({ method: "PATCH", path: `${PRODUCTS}/{id}`, tags: [TAG], successStatus: 204 })
    .errors({
      NOT_FOUND: { message: "Product not found" },
      CONFLICT: { message: "Slug already in use" },
    })
    .input(withParams(idParamSchema, updateProductInput)),
  remove: authedRoute
    .route({ method: "DELETE", path: `${PRODUCTS}/{id}`, tags: [TAG], successStatus: 204 })
    .errors({ NOT_FOUND: { message: "Product not found" } })
    .input(idParamSchema),
};

export type AdminProductsContract = typeof adminProductsContract;
