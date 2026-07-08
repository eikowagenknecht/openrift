import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { isoDateTime } from "@openrift/shared/schemas";
import { oc } from "@orpc/contract";
import { z } from "zod";

extendZodWithOpenApi(z);

/** Product slugs are URL segments: kebab-ish, 3..80 chars (ADR-015). */
export const productSlugRegex = /^[a-z0-9][a-z0-9-]{2,79}$/u;

/** Slugs that would collide with current or future /products/* app routes. */
export const RESERVED_PRODUCT_SLUGS = ["new", "create", "settings", "admin"] as const;

export const productSlugSchema = z
  .string()
  .regex(productSlugRegex, "Slug must be 3-80 chars of lowercase letters, digits, and dashes")
  .refine(
    (slug) => !(RESERVED_PRODUCT_SLUGS as readonly string[]).includes(slug),
    "This slug is reserved",
  );

export const productSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  /** Distinct printings in the product. */
  printingCount: z.number(),
  /** Total physical cards (sum of quantities). */
  cardTotal: z.number(),
  updatedAt: isoDateTime,
});

export const productContentSchema = z.object({
  printingId: z.string(),
  quantity: z.number(),
});

export const productsListResponseSchema = z
  .object({ products: z.array(productSummarySchema) })
  .openapi("ProductsListResponse");

export const productDetailResponseSchema = z
  .object({
    product: productSummarySchema,
    contents: z.array(productContentSchema),
  })
  .openapi("ProductDetailResponse");

/**
 * oRPC contract for the public preconstructed-product catalog (ADR-015).
 * Products are catalog data: public the moment they exist, no drafts. The
 * detail payload carries printing ids + quantities; clients resolve printings
 * against the catalog like the shared-collection page does.
 */
export const productsContract = {
  list: oc
    .route({ method: "GET", path: "/api/v1/products", tags: ["Products"] })
    .meta({ auth: "public", cache: "short", etag: true })
    .output(productsListResponseSchema),
  get: oc
    .route({ method: "GET", path: "/api/v1/products/{slug}", tags: ["Products"] })
    .meta({ auth: "public", cache: "short", etag: true })
    .errors({ NOT_FOUND: { message: "Product not found" } })
    .input(z.object({ slug: z.string() }))
    .output(productDetailResponseSchema),
};

export type ProductsContract = typeof productsContract;
export type ProductSummary = z.infer<typeof productSummarySchema>;
export type ProductContent = z.infer<typeof productContentSchema>;
export type ProductsListResponse = z.infer<typeof productsListResponseSchema>;
export type ProductDetailResponse = z.infer<typeof productDetailResponseSchema>;
