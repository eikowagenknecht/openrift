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

export const productSlugRegex = /^[a-z0-9][a-z0-9-]{2,79}$/u;

export const RESERVED_PRODUCT_SLUGS = ["new", "create", "settings", "admin"] as const;

export const productSlugSchema = z
  .string()
  .regex(productSlugRegex, "Slug must be 3-80 chars of lowercase letters, digits, and dashes")
  .refine(
    (slug) => !(RESERVED_PRODUCT_SLUGS as readonly string[]).includes(slug),
    "This slug is reserved",
  );

export const productCoverCardSchema = z.object({
  printingId: z.string(),
  imageId: z.string(),
  name: z.string(),
});

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
  set: productSetSchema.nullable(),
  printingCount: z.number(),
  cardTotal: z.number(),
  coverCards: z.array(productCoverCardSchema),
  updatedAt: isoDateTime,
});

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
    cards: z.record(z.string(), catalogCardResponseSchema),
    printings: z.array(catalogPrintingResponseSchema),
    sets: z.array(catalogSetResponseSchema),
  })
  .openapi("ProductDetailResponse");

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
