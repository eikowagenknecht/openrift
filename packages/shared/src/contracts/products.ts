import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
  catalogCardResponseSchema,
  catalogPrintingResponseSchema,
  catalogSetResponseSchema,
} from "@openrift/shared/response-schemas";
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

/** One representative printing for a product tile's card fan. */
export const productCoverCardSchema = z.object({
  printingId: z.string(),
  /** `image_files.id` of the active front image — resolve via `imageUrl()`. */
  imageId: z.string(),
  /** Card name, for alt text. */
  name: z.string(),
});

/** The set a product released with, for grouping the /products index. */
export const productSetSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
});

export const productSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  /** The set the product belongs to, or null for cross-set products. */
  set: productSetSchema.nullable(),
  /** Distinct printings in the product. */
  printingCount: z.number(),
  /** Total physical cards (sum of quantities). */
  cardTotal: z.number(),
  /**
   * Up to {@link PRODUCT_COVER_CARD_COUNT} representative printings with
   * images (legends first, then highest rarity), for the catalog tiles.
   */
  coverCards: z.array(productCoverCardSchema),
  updatedAt: isoDateTime,
});

/** How many cover cards a product summary carries at most. */
export const PRODUCT_COVER_CARD_COUNT = 4;

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
    /**
     * The cards behind `contents`, keyed by card id. Inlined (like the set
     * detail payload) so the page renders server-side from its own response
     * instead of waiting on the client-only catalog fetch.
     */
    cards: z.record(z.string(), catalogCardResponseSchema),
    /** The product's printings in canonical order. */
    printings: z.array(catalogPrintingResponseSchema),
    /**
     * Set metadata for the printings above. A product's contents can span sets
     * (promo inserts, cross-set kits), so this is the catalogue's set list
     * rather than the product's own set.
     */
    sets: z.array(catalogSetResponseSchema),
  })
  .openapi("ProductDetailResponse");

/**
 * oRPC contract for the public preconstructed-product catalog (ADR-015).
 * Products are catalog data: public the moment they exist, no drafts. The
 * detail payload inlines the cards and printings behind its contents, the same
 * shape the set detail read uses, so the page is server-renderable.
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
export type ProductSet = z.infer<typeof productSetSchema>;
export type ProductCoverCard = z.infer<typeof productCoverCardSchema>;
export type ProductSummary = z.infer<typeof productSummarySchema>;
export type ProductContent = z.infer<typeof productContentSchema>;
export type ProductsListResponse = z.infer<typeof productsListResponseSchema>;
export type ProductDetailResponse = z.infer<typeof productDetailResponseSchema>;
