import { z } from "zod";

import { setFieldRules } from "../../db/schemas.js";

// ── Catalog ────────────────────────────────────────────────────────────────

export const updateSetSchema = z.object({
  name: setFieldRules.name,
  printedTotal: setFieldRules.printedTotal,
  releasedAt: z.string().nullable(),
  released: z.boolean(),
  setType: setFieldRules.setType,
});

export const createSetSchema = z.object({
  id: setFieldRules.slug,
  name: setFieldRules.name,
  printedTotal: setFieldRules.printedTotal,
  releasedAt: z.string().nullable().optional(),
});

export const reorderSetsSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
});

// ── Feature Flags ──────────────────────────────────────────────────────────

export const createFlagSchema = z.object({
  key: z
    .string()
    .regex(/^[a-z][a-z0-9]+(-[a-z0-9]+)*$/, "Key must be kebab-case (e.g. deck-builder)"),
  description: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
});

export const updateFlagSchema = z
  .object({
    enabled: z.boolean().optional(),
    description: z.string().nullable().optional(),
  })
  .refine((o) => o.enabled !== undefined || o.description !== undefined, {
    message: "At least one field (enabled, description) must be provided",
  });

// ── User Feature Flags ─────────────────────────────────────────────────────

export const userIdParamSchema = z.object({
  id: z.string().min(1),
});

export const userKeyParamSchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1),
});

export const upsertOverrideSchema = z.object({
  enabled: z.boolean(),
});

// ── Languages ──────────────────────────────────────────────────────────────

export const codeParamSchema = z.object({ code: z.string().min(1) });

export const createLanguageSchema = z.object({
  code: z.string().min(1).max(5),
  name: z.string().min(1),
  sortOrder: z.number().int().optional(),
});

export const reorderLanguagesSchema = z.object({
  codes: z.array(z.string().min(1)).min(1),
});

export const updateLanguageSchema = z.object({
  name: z.string().min(1).optional(),
  sortOrder: z.number().int().optional(),
});

// ── Marketplace Groups ─────────────────────────────────────────────────────

export const updateGroupSchema = z.object({
  name: z.string().nullable(),
});

// ── Markers ────────────────────────────────────────────────────────────────

const slugRegex = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export const createMarkerSchema = z.object({
  slug: z.string().min(1).regex(slugRegex, "Slug must be kebab-case (e.g. top-8)"),
  label: z.string().min(1),
  description: z.string().min(1).nullable().optional(),
});

export const updateMarkerSchema = z.object({
  slug: z.string().min(1).regex(slugRegex, "Slug must be kebab-case").optional(),
  label: z.string().min(1).optional(),
  description: z.string().min(1).nullable().optional(),
});

// ── Distribution Channels ──────────────────────────────────────────────────

const distributionChannelKindEnum = z.enum(["event", "product"]);

export const createDistributionChannelSchema = z.object({
  slug: z.string().min(1).regex(slugRegex, "Slug must be kebab-case (e.g. nexus-night-2025)"),
  label: z.string().min(1),
  description: z.string().min(1).nullable().optional(),
  kind: distributionChannelKindEnum.optional(),
  parentId: z.string().uuid().nullable().optional(),
  childrenLabel: z.string().min(1).nullable().optional(),
});

export const updateDistributionChannelSchema = z.object({
  slug: z.string().min(1).regex(slugRegex, "Slug must be kebab-case").optional(),
  label: z.string().min(1).optional(),
  description: z.string().min(1).nullable().optional(),
  kind: distributionChannelKindEnum.optional(),
  parentId: z.string().uuid().nullable().optional(),
  childrenLabel: z.string().min(1).nullable().optional(),
});

// ── Provider Settings ──────────────────────────────────────────────────────

export const updateProviderSettingSchema = z.object({
  sortOrder: z.number().int().optional(),
  isHidden: z.boolean().optional(),
  isFavorite: z.boolean().optional(),
});

export const reorderProvidersSchema = z.object({
  providers: z.array(z.string().min(1)).min(1),
});

// ── Site Settings ──────────────────────────────────────────────────────────

const scopeEnum = z.enum(["web", "api"]);

export const createSettingSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9]+(-[a-z0-9]+)*$/, "Key must be kebab-case (e.g. umami-url)"),
  value: z.string(),
  scope: scopeEnum.optional(),
});

export const updateSettingSchema = z
  .object({
    value: z.string().optional(),
    scope: scopeEnum.optional(),
  })
  .refine((o) => o.value !== undefined || o.scope !== undefined, {
    message: "At least one field (value, scope) must be provided",
  });

// ── Operations ─────────────────────────────────────────────────────────────

const clearPriceMarketplaceSchema = z.enum(["tcgplayer", "cardmarket", "cardtrader"]);

export const clearPricesSchema = z.object({
  marketplace: clearPriceMarketplaceSchema,
});

const upsertCountsSchema = z.object({
  total: z.number().openapi({ example: 468 }),
  new: z.number().openapi({ example: 12 }),
  updated: z.number().openapi({ example: 455 }),
  unchanged: z.number().openapi({ example: 1 }),
});

export const priceRefreshResponseSchema = z.object({
  transformed: z.object({
    groups: z.number().openapi({ example: 3 }),
    products: z.number().openapi({ example: 312 }),
    prices: z.number().openapi({ example: 468 }),
  }),
  upserted: z.object({
    snapshots: upsertCountsSchema,
    staging: upsertCountsSchema,
  }),
});

// ── Ignored Candidates ─────────────────────────────────────────────────────

export const ignoreCandidateCardSchema = z.object({
  provider: z.string().min(1),
  externalId: z.string().min(1),
});

export const ignoreCandidatePrintingSchema = z.object({
  provider: z.string().min(1),
  externalId: z.string().min(1),
  finish: z.string().min(1).nullable().optional(),
});

export const unignoreCandidatePrintingSchema = z.object({
  provider: z.string().min(1),
  externalId: z.string().min(1),
  finish: z.string().min(1).nullable(),
});

// ── Ignored Products ───────────────────────────────────────────────────────

const ignoreLevelTwoItemSchema = z.object({
  externalId: z.number(),
});

const ignoreLevelThreeItemSchema = z.object({
  externalId: z.number(),
  finish: z.string(),
  language: z.string(),
});

/** Level 2: deny the entire upstream product regardless of finish/language. */
const ignoreProductsBodySchema = z.object({
  level: z.literal("product"),
  marketplace: z.enum(["tcgplayer", "cardmarket", "cardtrader"]),
  products: z.array(ignoreLevelTwoItemSchema).min(1),
});

/** Level 3: deny a specific (finish, language) SKU of an upstream product. */
const ignoreVariantsBodySchema = z.object({
  level: z.literal("variant"),
  marketplace: z.enum(["tcgplayer", "cardmarket", "cardtrader"]),
  products: z.array(ignoreLevelThreeItemSchema).min(1),
});

export const ignoreProductsSchema = z.discriminatedUnion("level", [
  ignoreProductsBodySchema,
  ignoreVariantsBodySchema,
]);

// ── Images ─────────────────────────────────────────────────────────────────

export const restoreImageUrlsSchema = z.object({
  provider: z.string().min(1),
});

// ── Unified Mappings ───────────────────────────────────────────────────────

export const marketplaceSchema = z.object({
  marketplace: z.enum(["tcgplayer", "cardmarket", "cardtrader"]),
});

export const saveMappingsSchema = z.object({
  mappings: z.array(
    z.object({
      printingId: z.string().uuid(),
      externalId: z.number(),
    }),
  ),
});

export const unmapSchema = z.object({
  printingId: z.string().uuid(),
});

// ── Staging Card Overrides ─────────────────────────────────────────────────

export const stagingCardOverrideSchema = z.object({
  marketplace: z.enum(["tcgplayer", "cardmarket", "cardtrader"]),
  externalId: z.number(),
  finish: z.string(),
  language: z.string(),
  cardId: z.string().uuid(),
});

export const deleteOverrideSchema = z.object({
  marketplace: z.enum(["tcgplayer", "cardmarket", "cardtrader"]),
  externalId: z.number(),
  finish: z.string(),
  language: z.string(),
});

// ── Typography Review ──────────────────────────────────────────────────────

export const typographyDiffItemSchema = z.object({
  entity: z.enum(["card", "printing"]),
  id: z.string().uuid().openapi({ example: "019cfc3b-0389-744b-837c-792fd586300e" }),
  name: z.string().openapi({ example: "Jinx, Rebel" }),
  field: z.string().openapi({ example: "printedRulesText" }),
  current: z.string().openapi({ example: 'Deal 2 damage to target unit. "This\'ll hurt..."' }),
  proposed: z.string().openapi({ example: "Deal 2 damage to target unit. “This’ll hurt…”" }),
});

export const acceptTypographyFixSchema = z.object({
  entity: z.enum(["card", "printing"]),
  id: z.string().uuid(),
  field: z.string(),
  proposed: z.string(),
});
