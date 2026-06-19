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
    .regex(/^[a-z][a-z0-9]+(?:-[a-z0-9]+)*$/u, "Key must be kebab-case (e.g. deck-builder)"),
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

export const marketplaceGroupKindEnum = z.enum(["basic", "special"]);

export const updateGroupSchema = z
  .object({
    name: z.string().nullable().optional(),
    groupKind: marketplaceGroupKindEnum.optional(),
    setId: z.string().uuid().nullable().optional(),
  })
  .refine((o) => o.name !== undefined || o.groupKind !== undefined || o.setId !== undefined, {
    message: "At least one field (name, groupKind, setId) must be provided",
  });

// ── Markers ────────────────────────────────────────────────────────────────

const slugRegex = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;

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

// ── Custom Tag Categories ──────────────────────────────────────────────────

export const createCustomTagCategorySchema = z.object({
  slug: z.string().min(1).regex(slugRegex, "Slug must be kebab-case (e.g. region)"),
  label: z.string().min(1),
  description: z.string().min(1).nullable().optional(),
});

export const updateCustomTagCategorySchema = z.object({
  slug: z.string().min(1).regex(slugRegex, "Slug must be kebab-case").optional(),
  label: z.string().min(1).optional(),
  description: z.string().min(1).nullable().optional(),
});

// ── Custom Tags ────────────────────────────────────────────────────────────

export const createCustomTagSchema = z.object({
  slug: z.string().min(1).regex(slugRegex, "Slug must be kebab-case (e.g. bandle-city)"),
  label: z.string().min(1),
  categoryId: z.string().uuid(),
  description: z.string().min(1).nullable().optional(),
});

export const updateCustomTagSchema = z.object({
  slug: z.string().min(1).regex(slugRegex, "Slug must be kebab-case").optional(),
  label: z.string().min(1).optional(),
  categoryId: z.string().uuid().optional(),
  description: z.string().min(1).nullable().optional(),
});

export const setCardCustomTagsSchema = z.object({
  customTagIds: z.array(z.string().uuid()),
});

export const addCardsToCustomTagSchema = z.object({
  cardIds: z.array(z.string().uuid()),
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
  key: z
    .string()
    .regex(/^[a-z][a-z0-9]+(?:-[a-z0-9]+)*$/u, "Key must be kebab-case (e.g. umami-url)"),
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

// ── Job runs ──────────────────────────────────────────────────────────────

export const jobRunStartedResponseSchema = z.object({
  runId: z.string().uuid().openapi({ example: "4f8e4f36-2b7b-4c8d-8b6e-5c2e3a8f1a2b" }),
  status: z.enum(["running", "already_running"]).openapi({ example: "running" }),
});

const jobRunViewSchema = z.object({
  id: z.string().uuid(),
  kind: z.string().openapi({ example: "cardtrader.refresh" }),
  trigger: z.enum(["cron", "admin", "api"]),
  status: z.enum(["running", "succeeded", "failed"]),
  startedAt: z.string().openapi({ example: "2026-04-23T12:00:00.000Z" }),
  finishedAt: z.string().nullable(),
  durationMs: z.number().nullable(),
  errorMessage: z.string().nullable(),
  result: z.record(z.string(), z.any()).nullable(),
});

export const jobRunsListResponseSchema = z.object({
  runs: z.array(jobRunViewSchema),
  /** Total rows matching the active filters, across all pages. */
  total: z.number().int(),
  /** The 1-based page number this response represents. */
  page: z.number().int(),
  /** Page size used to compute the page count. */
  limit: z.number().int(),
  /** Distinct job kinds in the table, for the kind filter dropdown. */
  kinds: z.array(z.string()),
});

export const jobRunsQuerySchema = z.object({
  kind: z.string().optional(),
  trigger: z.enum(["cron", "admin", "api"]).optional(),
  status: z.enum(["running", "succeeded", "failed"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
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
  language: z.string().nullable(),
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

// ── Unified Mappings ───────────────────────────────────────────────────────

export const marketplaceSchema = z.object({
  marketplace: z.enum(["tcgplayer", "cardmarket", "cardtrader"]),
});

export const saveMappingsSchema = z.object({
  mappings: z.array(
    z.object({
      printingId: z.string().uuid(),
      externalId: z.number(),
      /** The marketplace's own view of the SKU finish — always `normal` / `foil`. */
      finish: z.string(),
      /** `null` for marketplaces that don't expose language as a SKU dimension (CM/TCG). */
      language: z.string().nullable(),
    }),
  ),
});

// DELETE /marketplace-mappings addresses the variant binding by its composite
// SKU key via query params — externalId is coerced from its string
// form, and an omitted `language` means null (CM/TCG have no language axis).
export const unmapQuerySchema = z.object({
  marketplace: z.enum(["tcgplayer", "cardmarket", "cardtrader"]),
  printingId: z.string().uuid(),
  externalId: z.coerce.number().int(),
  /** The marketplace's own view of the SKU finish — always `normal` / `foil`. */
  finish: z.string(),
  /** Omitted for marketplaces that don't expose language as a SKU dimension (CM/TCG). */
  language: z.string().optional(),
});

// ── Staging Card Overrides ─────────────────────────────────────────────────

export const stagingCardOverrideSchema = z.object({
  marketplace: z.enum(["tcgplayer", "cardmarket", "cardtrader"]),
  externalId: z.number(),
  finish: z.string(),
  language: z.string().nullable(),
  cardId: z.string().uuid(),
});

// DELETE /staging-card-overrides addresses the override by its product SKU via
// query params; externalId is coerced and an omitted `language` is null.
export const deleteOverrideQuerySchema = z.object({
  marketplace: z.enum(["tcgplayer", "cardmarket", "cardtrader"]),
  externalId: z.coerce.number(),
  finish: z.string(),
  language: z.string().optional(),
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
