import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { isoDateTime } from "@openrift/shared/schemas";
import { z } from "zod";

import { marketplaceEnum } from "../../schemas.js";
import { authedRoute } from "../_base.js";

extendZodWithOpenApi(z);

const TAG = "Admin - Ignored Products";

const IP = "/api/admin/v1/ignored-products";

/**
 * `product` denies the whole upstream product; `variant` denies one specific
 * SKU. `language` is `null` for marketplaces that don't expose it as a SKU
 * dimension (CM/TCG).
 */
export const ignoredProductSchema = z
  .discriminatedUnion("level", [
    z.object({
      level: z.literal("product"),
      marketplace: z.string(),
      externalId: z.number(),
      productName: z.string(),
      createdAt: isoDateTime,
    }),
    z.object({
      level: z.literal("variant"),
      marketplace: z.string(),
      externalId: z.number(),
      finish: z.string(),
      language: z.string().nullable(),
      productName: z.string(),
      createdAt: isoDateTime,
    }),
  ])
  .openapi("IgnoredProductResponse");

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
 * Admin ignored-products controls, mounted at `/api/admin/v1/ignored-products`.
 * The unignore DELETE carries a body (compact mode reads it; only query
 * params are dropped).
 */
export const adminIgnoredProductsContract = {
  list: authedRoute
    .route({ method: "GET", path: IP, tags: [TAG] })
    .output(z.object({ products: z.array(ignoredProductSchema) })),
  ignore: authedRoute
    .route({ method: "POST", path: IP, tags: [TAG] })
    .input(ignoreProductsInput)
    .output(z.object({ ignored: z.number() })),
  unignore: authedRoute
    .route({ method: "DELETE", path: IP, tags: [TAG] })
    .input(ignoreProductsInput)
    .output(z.object({ unignored: z.number() })),
};

export type AdminIgnoredProductsContract = typeof adminIgnoredProductsContract;
export interface IgnoredProductsResponse {
  products: z.infer<typeof ignoredProductSchema>[];
}
