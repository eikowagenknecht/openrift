import { oc } from "@orpc/contract";
import { z } from "zod";

import { marketplaceEnum } from "../../schemas.js";

const TAG = "Admin - Ignored Products";

const IP = "/api/admin/v1/ignored-products";

const ignoredProductSchema = z.discriminatedUnion("level", [
  z.object({
    level: z.literal("product"),
    marketplace: z.string(),
    externalId: z.number(),
    productName: z.string(),
    createdAt: z.string(),
  }),
  z.object({
    level: z.literal("variant"),
    marketplace: z.string(),
    externalId: z.number(),
    finish: z.string(),
    language: z.string().nullable(),
    productName: z.string(),
    createdAt: z.string(),
  }),
]);

// POST/DELETE body: a batch keyed by level. Level 2 (product) denies the whole
// upstream product; level 3 (variant) denies a specific (finish, language) SKU.
const ignoreProductsInput = z.discriminatedUnion("level", [
  z.object({
    level: z.literal("product"),
    marketplace: marketplaceEnum,
    products: z.array(z.object({ externalId: z.number() })).min(1),
  }),
  z.object({
    level: z.literal("variant"),
    marketplace: marketplaceEnum,
    products: z
      .array(
        z.object({
          externalId: z.number(),
          finish: z.string(),
          language: z.string().nullable(),
        }),
      )
      .min(1),
  }),
]);

/**
 * oRPC contract for the admin ignored-products controls (mounted at
 * `/api/admin/v1/ignored-products`, admin-gated by the mount). The list is a
 * `level`-discriminated union; ignore (POST) and unignore (DELETE) share the
 * same batch body. The DELETE carries a body (compact mode reads it; only
 * DELETE query params are dropped).
 */
export const adminIgnoredProductsContract = {
  list: oc
    .route({ method: "GET", path: IP, tags: [TAG] })
    .output(z.object({ products: z.array(ignoredProductSchema) })),
  ignore: oc
    .route({ method: "POST", path: IP, tags: [TAG] })
    .input(ignoreProductsInput)
    .output(z.object({ ignored: z.number() })),
  unignore: oc
    .route({ method: "DELETE", path: IP, tags: [TAG] })
    .input(ignoreProductsInput)
    .output(z.object({ unignored: z.number() })),
};

export type AdminIgnoredProductsContract = typeof adminIgnoredProductsContract;
export interface IgnoredProductsResponse {
  products: z.infer<typeof ignoredProductSchema>[];
}
