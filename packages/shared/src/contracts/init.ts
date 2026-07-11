import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { distributionChannelSchema } from "@openrift/shared/response-schemas";
import { oc } from "@orpc/contract";
import { z } from "zod";

extendZodWithOpenApi(z);

export const keywordEntrySchema = z.object({
  color: z.string().openapi({ example: "#24705f" }),
  darkText: z.boolean().openapi({ example: false }),
  /** Keyword whose glyph cost renders inside its bracket, e.g. `[Equip :rb_energy_1:]`. */
  costKeyword: z.boolean().openapi({ example: false }),
  translations: z
    .record(z.string(), z.string())
    .optional()
    .openapi({ example: { de: "Beschleunigen" } }),
});

const enumRowSchema = z.object({
  slug: z.string().openapi({ example: "Unit" }),
  label: z.string().openapi({ example: "Unit" }),
  sortOrder: z.number().openapi({ example: 1 }),
});

const coloredEnumRowSchema = enumRowSchema.extend({
  color: z.string().nullable().openapi({ example: "#b8336a" }),
});

const describedEnumRowSchema = enumRowSchema.extend({
  description: z.string().nullable().openapi({ example: "Promo stamp around the rarity symbol" }),
});

const customTagSchema = z.object({
  id: z.string().openapi({ example: "019d4999-4219-72f6-b7bb-64004e1b1bff" }),
  slug: z.string().openapi({ example: "bandle-city" }),
  label: z.string().openapi({ example: "Bandle City" }),
  category: z.string().openapi({ example: "region" }),
  categoryLabel: z.string().openapi({ example: "Region" }),
  description: z.string().nullable().openapi({ example: null }),
  sortOrder: z.number().openapi({ example: 0 }),
});

export const initResponseSchema = z
  .object({
    enums: z.object({
      cardTypes: z.array(enumRowSchema),
      rarities: z.array(coloredEnumRowSchema),
      domains: z.array(coloredEnumRowSchema),
      superTypes: z.array(enumRowSchema),
      finishes: z.array(enumRowSchema),
      artVariants: z.array(enumRowSchema),
      cardSizes: z.array(enumRowSchema),
      deckFormats: z.array(enumRowSchema),
      deckZones: z.array(enumRowSchema),
      conditions: z.array(enumRowSchema),
      graders: z.array(enumRowSchema),
      languages: z.array(enumRowSchema),
      markers: z.array(describedEnumRowSchema),
    }),
    keywords: z.record(z.string(), keywordEntrySchema),
    distributionChannels: z.array(distributionChannelSchema).openapi({ example: [] }),
    customTags: z.array(customTagSchema).openapi({ example: [] }),
    championIdentifierTags: z.array(z.string()).openapi({ example: ["Garen", "Karma", "Yasuo"] }),
    /** Categories for the printed card tags, in display order. */
    tagCategories: z.array(enumRowSchema).openapi({
      example: [{ slug: "region", label: "Region", sortOrder: 0 }],
    }),
    /** Printed tag → category slug. Tags without an entry are unclassified. */
    tagCategoryMap: z.record(z.string(), z.string()).openapi({
      example: { Ionia: "region", Poro: "species" },
    }),
  })
  .openapi("InitResponse");

/**
 * oRPC contract for the public init (bootstrap) endpoint.
 * `GET /api/v1/init` — enums, keywords, distribution channels and custom tags
 * in one request. Edge-cached (ETag via the mount's `etag()`).
 */
export const initContract = {
  get: oc
    .route({ method: "GET", path: "/api/v1/init", tags: ["Init"] })
    .meta({ auth: "public", cache: "long", etag: true })
    .output(initResponseSchema),
};

export type InitContract = typeof initContract;
