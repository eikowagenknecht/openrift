// oxlint-disable-next-line import/no-unassigned-import -- type augmentation: adds .openapi() to Zod schemas
import "@asteasolutions/zod-to-openapi";
import { z } from "zod";

import { ERROR_CODES } from "./error-codes.js";
import type { ErrorCode } from "./error-codes.js";

// ── Error envelope ───────────────────────────────────────────────────────────
// The single shape every 4xx/5xx returns ({ error, code }). Published here so
// routes can document their error responses and the typed client can codegen
// the error type. `details` (validation issues / dev stack) is deliberately NOT
// in the schema: it is an optional dev/validation extra, not part of the stable
// contract, and a `z.unknown()` field would break createServerFn's return-type
// check on the web side.
const errorCodeValues = Object.values(ERROR_CODES) as [ErrorCode, ...ErrorCode[]];

export const apiErrorResponseSchema = z
  .object({
    error: z.string().openapi({ example: "Not found" }),
    code: z.enum(errorCodeValues).openapi({ example: ERROR_CODES.NOT_FOUND }),
  })
  .openapi("ApiErrorResponse");

// ── Field-diff values ────────────────────────────────────────────────────────
// A diffed field's value: a JSON scalar or an array of scalars. This is the
// heterogeneous-but-not-nested shape that card/printing field values take in a
// change diff (string, number, boolean, null, string[], …).
//
// Deliberately NON-recursive: a fully recursive JSON type breaks both
// @hono/zod-openapi (TS2589 "excessively deep") and hc's response-type inference
// (it leaks the ZodType through). And it must not be `unknown` — TanStack Start's
// createServerFn return-type check rejects `unknown` as non-serializable. This
// bounded union satisfies all three.

const diffScalarSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export type DiffValue = z.infer<typeof diffScalarSchema> | z.infer<typeof diffScalarSchema>[];
export const diffValueSchema = z.union([diffScalarSchema, z.array(diffScalarSchema)]);

// ── Enums ────────────────────────────────────────────────────────────────────

const cardTypeSchema = z.string().openapi({ example: "Unit" });
const raritySchema = z.string().openapi({ example: "Epic" });
const domainSchema = z.string().openapi({ example: "Chaos" });
const superTypeSchema = z.string().openapi({ example: "Champion" });
const artVariantSchema = z.string().openapi({ example: "normal" });
const finishSchema = z.string().openapi({ example: "foil" });
const activityActionSchema = z.enum(["added", "removed", "moved"]);
const deckFormatSchema = z.string().openapi({ example: "constructed" });
const deckZoneSchema = z.enum([
  "main",
  "sideboard",
  "legend",
  "champion",
  "runes",
  "battlefield",
  "overflow",
]);
const cardFaceSchema = z.enum(["front", "back"]);

// ── Health ───────────────────────────────────────────────────────────────────

export const healthResponseSchema = z
  .object({ status: z.string().openapi({ example: "ok" }) })
  .openapi("HealthResponse");

// ── Admin Status ────────────────────────────────────────────────────────────

const lastJobRunSchema = z.object({
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  durationMs: z.number().nullable(),
  status: z.enum(["running", "succeeded", "failed"]),
  errorMessage: z.string().nullable(),
});

const cronJobStatusSchema = z.object({
  enabled: z.boolean(),
  nextRun: z.string().nullable(),
  lastRun: lastJobRunSchema.nullable(),
});

export const adminStatusResponseSchema = z
  .object({
    server: z.object({
      uptimeSeconds: z.number(),
      memoryMb: z.object({
        rss: z.number(),
        heapUsed: z.number(),
        heapTotal: z.number(),
      }),
      bunVersion: z.string(),
      environment: z.string(),
    }),
    database: z.object({
      status: z.string(),
      sizeMb: z.number().nullable(),
      activeConnections: z.number().nullable(),
      latestMigration: z.string().nullable(),
      totalMigrations: z.number(),
    }),
    cron: z.object({
      jobs: z.object({
        tcgplayer: cronJobStatusSchema,
        cardmarket: cronJobStatusSchema,
        cardtrader: cronJobStatusSchema,
        printingEvents: cronJobStatusSchema,
        changelog: cronJobStatusSchema,
        jobRunsCleanup: cronJobStatusSchema,
      }),
    }),
    app: z.object({
      totalUsers: z.number(),
      recentSignups7d: z.number(),
      totalCards: z.number(),
      totalPrintings: z.number(),
      totalSets: z.number(),
      totalCollections: z.number(),
      totalDecks: z.number(),
      totalCopies: z.number(),
    }),
    pricing: z.object({
      totalPrices: z.number(),
      sources: z.array(
        z.object({
          marketplace: z.string(),
          products: z.number(),
          prices: z.number(),
          latestPrice: z.string().nullable(),
        }),
      ),
    }),
  })
  .openapi("AdminStatusResponse");

// ── Feature Flags ────────────────────────────────────────────────────────────

export const featureFlagsResponseSchema = z
  .object({
    flags: z.record(z.string(), z.boolean()).openapi({
      example: { collection: true, decks: true },
    }),
  })
  .openapi("FeatureFlagsResponse");

// ── Keywords ─────────────────────────────────────────────────────────────────

const keywordEntrySchema = z.object({
  color: z.string().openapi({ example: "#24705f" }),
  darkText: z.boolean().openapi({ example: false }),
  translations: z
    .record(z.string(), z.string())
    .optional()
    .openapi({ example: { de: "Beschleunigen" } }),
});

// ── Init ─────────────────────────────────────────────────────────────────────

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

const distributionChannelSchema = z.object({
  id: z.string().openapi({ example: "019cfc3b-0369-7000-8000-000000000002" }),
  slug: z.string().openapi({ example: "nexus-night" }),
  label: z.string().openapi({ example: "Nexus Night" }),
  description: z.string().nullable().openapi({ example: null }),
  kind: z.enum(["event", "product"]).openapi({ example: "event" }),
  parentId: z.string().nullable().openapi({ example: null }),
  childrenLabel: z.string().nullable().openapi({ example: null }),
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
      deckFormats: z.array(enumRowSchema),
      deckZones: z.array(enumRowSchema),
      languages: z.array(enumRowSchema),
      markers: z.array(describedEnumRowSchema),
    }),
    keywords: z.record(z.string(), keywordEntrySchema),
    distributionChannels: z.array(distributionChannelSchema).openapi({ example: [] }),
    customTags: z.array(customTagSchema).openapi({ example: [] }),
    championIdentifierTags: z.array(z.string()).openapi({ example: ["Garen", "Karma", "Yasuo"] }),
  })
  .openapi("InitResponse");

// ── Prices ───────────────────────────────────────────────────────────────────

// Latest market price per marketplace, as integer cents in that marketplace's
// own currency (tcgplayer=USD, cardmarket=EUR, cardtrader=EUR — see
// MARKETPLACE_CURRENCY). SCH-2: money on the wire is integer cents.
const marketplacePriceMapSchema = z.object({
  tcgplayer: z
    .number()
    .int()
    .optional()
    .openapi({ example: 452, description: "Integer cents (USD)" }),
  cardmarket: z
    .number()
    .int()
    .optional()
    .openapi({ example: 380, description: "Integer cents (EUR)" }),
  cardtrader: z
    .number()
    .int()
    .optional()
    .openapi({ example: 390, description: "Integer cents (EUR)" }),
});

const marketplaceCurrenciesSchema = z
  .object({
    tcgplayer: z.enum(["EUR", "USD"]),
    cardmarket: z.enum(["EUR", "USD"]),
    cardtrader: z.enum(["EUR", "USD"]),
  })
  .openapi({ example: { tcgplayer: "USD", cardmarket: "EUR", cardtrader: "EUR" } });

export const pricesResponseSchema = z
  .object({
    prices: z.record(z.string(), marketplacePriceMapSchema).openapi({
      example: {
        "019cfc3b-03d3-7dac-86c9-27900cd43727": {
          tcgplayer: 452,
          cardmarket: 380,
          cardtrader: 390,
        },
      },
    }),
    // SCH-2: the cents amounts above are explicit about their currency here.
    currencies: marketplaceCurrenciesSchema,
  })
  .openapi("PricesResponse");

// Snapshot money fields are integer cents (SCH-2). `date` is a date-only string
// (YYYY-MM-DD), not an ISO datetime.
const tcgplayerSnapshotSchema = z.object({
  date: z.string().openapi({ example: "2026-04-01", description: "Date-only (YYYY-MM-DD), USD" }),
  market: z.number().int().openapi({ example: 452, description: "Integer cents (USD)" }),
  low: z.number().int().nullable().openapi({ example: 325, description: "Integer cents (USD)" }),
});

const cardmarketSnapshotSchema = z.object({
  date: z.string().openapi({ example: "2026-04-01", description: "Date-only (YYYY-MM-DD), EUR" }),
  market: z.number().int().openapi({ example: 380, description: "Integer cents (EUR)" }),
  low: z.number().int().nullable().openapi({ example: 250, description: "Integer cents (EUR)" }),
});

const cardtraderSnapshotSchema = z.object({
  date: z.string().openapi({ example: "2026-04-01", description: "Date-only (YYYY-MM-DD), EUR" }),
  zeroLow: z
    .number()
    .int()
    .nullable()
    .openapi({ example: 420, description: "Integer cents (EUR)" }),
  low: z.number().int().nullable().openapi({ example: 390, description: "Integer cents (EUR)" }),
});

const marketplaceInfoSchema = z.object({
  available: z.boolean().openapi({ example: true }),
  productId: z.number().nullable().openapi({ example: 582_391 }),
});

const currencyFieldSchema = z.enum(["EUR", "USD"]);

export const priceHistoryResponseSchema = z
  .object({
    tcgplayer: marketplaceInfoSchema.extend({
      currency: currencyFieldSchema,
      snapshots: z.array(tcgplayerSnapshotSchema),
    }),
    cardmarket: marketplaceInfoSchema.extend({
      currency: currencyFieldSchema,
      snapshots: z.array(cardmarketSnapshotSchema),
    }),
    cardtrader: marketplaceInfoSchema.extend({
      currency: currencyFieldSchema,
      snapshots: z.array(cardtraderSnapshotSchema),
    }),
  })
  .openapi("PriceHistoryResponse");

export const marketplaceInfoResponseSchema = z
  .object({
    infos: z
      .record(
        z.string(),
        z.object({
          tcgplayer: marketplaceInfoSchema,
          cardmarket: marketplaceInfoSchema,
          cardtrader: marketplaceInfoSchema,
        }),
      )
      .openapi({
        example: {
          "019cfc3b-03d3-7dac-86c9-27900cd43727": {
            tcgplayer: { available: true, productId: 582_391 },
            cardmarket: { available: true, productId: 748_215 },
            cardtrader: { available: false, productId: null },
          },
        },
      }),
  })
  .openapi("MarketplaceInfoResponse");

// ── Catalog ──────────────────────────────────────────────────────────────────

const catalogSetResponseSchema = z.object({
  id: z.string().openapi({ example: "019cfc3b-0369-7890-a450-7859471cc3f6" }),
  slug: z.string().openapi({ example: "OGN" }),
  name: z.string().openapi({ example: "Origins" }),
  releasedAt: z.string().nullable().openapi({ example: "2025-10-31" }),
  released: z.boolean().openapi({ example: true }),
  setType: z.enum(["main", "supplemental"]).openapi({ example: "main" }),
});

const markerSchema = z.object({
  id: z.string().openapi({ example: "019cfc3b-0369-7000-8000-000000000001" }),
  slug: z.string().openapi({ example: "promo" }),
  label: z.string().openapi({ example: "Promo" }),
  description: z.string().nullable().openapi({ example: null }),
});

const printingDistributionChannelSchema = z.object({
  channel: distributionChannelSchema,
  distributionNote: z.string().nullable().openapi({ example: null }),
  ancestorLabels: z.array(z.string()).openapi({ example: [] }),
});

const imageIdSchema = z.string().openapi({ example: "019d02f1-d14f-769f-9295-9852db692dbe" });

const printingImageSchema = z.object({
  face: cardFaceSchema,
  imageId: imageIdSchema,
});

const cardBanSchema = z.object({
  formatId: z.string().openapi({ example: "019cfc3b-0369-7000-8000-000000000002" }),
  formatName: z.string().openapi({ example: "Constructed" }),
  bannedAt: z.string().openapi({ example: "2026-01-15" }),
  reason: z.string().nullable().openapi({ example: "Power level" }),
});

const catalogCardResponseSchema = z.object({
  id: z.string().openapi({ example: "019cfc3b-0389-744b-837c-792fd586300e" }),
  slug: z.string().openapi({ example: "jinx-rebel" }),
  name: z.string().openapi({ example: "Jinx, Rebel" }),
  type: cardTypeSchema,
  superTypes: z.array(superTypeSchema).openapi({ example: ["Champion"] }),
  domains: z.array(domainSchema).openapi({ example: ["Chaos"] }),
  might: z.number().nullable().openapi({ example: 5 }),
  energy: z.number().nullable().openapi({ example: 5 }),
  power: z.number().nullable().openapi({ example: null }),
  keywords: z.array(z.string()).openapi({ example: [] }),
  tags: z.array(z.string()).openapi({ example: [] }),
  mightBonus: z.number().nullable().openapi({ example: null }),
  errata: z
    .object({
      correctedRulesText: z.string().nullable(),
      correctedEffectText: z.string().nullable(),
      source: z.string(),
      sourceUrl: z.string().nullable(),
      effectiveDate: z.string().nullable(),
    })
    .nullable()
    .openapi({ example: null }),
  bans: z.array(cardBanSchema).openapi({ example: [] }),
});

const catalogPrintingResponseSchema = z.object({
  id: z.string().openapi({ example: "019cfc3b-03d3-7dac-86c9-27900cd43727" }),
  shortCode: z.string().openapi({ example: "OGN-202" }),
  setId: z.string().openapi({ example: "019cfc3b-0369-7890-a450-7859471cc3f6" }),
  rarity: raritySchema,
  artVariant: artVariantSchema,
  isSigned: z.boolean().openapi({ example: false }),
  markers: z.array(markerSchema).openapi({ example: [] }),
  distributionChannels: z.array(printingDistributionChannelSchema).openapi({ example: [] }),
  finish: finishSchema,
  images: z.array(printingImageSchema),
  artist: z.string().openapi({ example: "Kudos Productions" }),
  publicCode: z.string().openapi({ example: "OGN-202/298" }),
  printedRulesText: z.string().nullable().openapi({ example: null }),
  printedEffectText: z.string().nullable().openapi({ example: null }),
  flavorText: z.string().nullable().openapi({ example: null }),
  printedName: z.string().nullable().openapi({ example: null }),
  printedYear: z.number().int().nullable().openapi({ example: 2025 }),
  language: z.string().openapi({ example: "EN" }),
  comment: z.string().nullable().openapi({ example: null }),
  // Integer sort key from the `printings_ordered` view. The handler already
  // emits it (via the `...rest` spread) and the web sorts printings by it, but
  // the schema previously omitted it — so the typed client inferred a response
  // missing this required field.
  canonicalRank: z.number().int().openapi({ example: 1 }),
  cardId: z.string().openapi({ example: "019cfc3b-0389-744b-837c-792fd586300e" }),
});

// Wire-only shapes for /catalog: identity lives in the map key, not the value.
const catalogCardResponseValueSchema = catalogCardResponseSchema.omit({ id: true });
const catalogPrintingResponseValueSchema = catalogPrintingResponseSchema.omit({ id: true });

export const catalogResponseSchema = z
  .object({
    sets: z.array(catalogSetResponseSchema),
    cards: z.record(z.string(), catalogCardResponseValueSchema),
    printings: z.record(z.string(), catalogPrintingResponseValueSchema),
    totalCopies: z.number().openapi({ example: 142 }),
    /**
     * Map of card id → array of custom-tag slugs (sorted). Admin-curated
     * tags supplementing the catalogue's intrinsic data; consumed only by
     * custom deck-builder formats (e.g. region-locked freeform). Standard
     * UI should not render these alongside `card.tags`.
     */
    customTagAssignments: z.record(z.string(), z.array(z.string())).openapi({ example: {} }),
  })
  .openapi("CatalogResponse");

// ── Landing Summary ─────────────────────────────────────────────────────────

export const landingSummaryResponseSchema = z
  .object({
    cardCount: z.number().openapi({ example: 312 }),
    printingCount: z.number().openapi({ example: 468 }),
    copyCount: z.number().openapi({ example: 142 }),
    thumbnailIds: z.array(z.string()).openapi({
      example: ["019d02f1-d14f-769f-9295-9852db692dbe"],
    }),
  })
  .openapi("LandingSummaryResponse");

// ── Card Detail ─────────────────────────────────────────────────────────────

export const cardDetailResponseSchema = z
  .object({
    card: catalogCardResponseSchema,
    printings: z.array(catalogPrintingResponseSchema),
    sets: z.array(catalogSetResponseSchema),
    // prices are NOT inlined — read them from the /prices resource.
  })
  .openapi("CardDetailResponse");

// ── Sets ────────────────────────────────────────────────────────────────────

const setListEntrySchema = catalogSetResponseSchema.extend({
  cardCount: z.number().openapi({ example: 312 }),
  printingCount: z.number().openapi({ example: 468 }),
  coverImageId: imageIdSchema.nullable(),
});

export const setListResponseSchema = z
  .object({ sets: z.array(setListEntrySchema) })
  .openapi("SetListResponse");

export const setDetailResponseSchema = z
  .object({
    set: catalogSetResponseSchema,
    cards: z.record(z.string(), catalogCardResponseSchema),
    printings: z.array(catalogPrintingResponseSchema),
    // prices are NOT inlined — read them from the /prices resource.
  })
  .openapi("SetDetailResponse");

// ── Promos page (public — distribution channels of every kind) ─────────────

const distributionChannelWithCountSchema = distributionChannelSchema.extend({
  cardCount: z.number().openapi({ example: 12 }),
  printingCount: z.number().openapi({ example: 24 }),
});

export const promosListResponseSchema = z
  .object({
    channels: z.array(distributionChannelWithCountSchema),
    cards: z.record(z.string(), catalogCardResponseSchema),
    printings: z.array(catalogPrintingResponseSchema),
    // prices are NOT inlined — read them from the /prices resource.
  })
  .openapi("PromosListResponse");

// ── Sitemap Data ────────────────────────────────────────────────────────────

const sitemapEntrySchema = z.object({
  slug: z.string().openapi({ example: "jinx-rebel" }),
  updatedAt: z.string().openapi({ example: "2026-04-01T12:00:00.000Z" }),
});

export const sitemapDataResponseSchema = z
  .object({
    cards: z.array(sitemapEntrySchema),
    sets: z.array(sitemapEntrySchema),
  })
  .openapi("SitemapDataResponse");

// ── Collections ──────────────────────────────────────────────────────────────

export const collectionResponseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    availableForDeckbuilding: z.boolean(),
    isInbox: z.boolean(),
    sortOrder: z.number(),
    isPublic: z.boolean(),
    shareToken: z.string().nullable(),
    copyCount: z.number(),
    totalValueCents: z.number().int().nullable(),
    unpricedCopyCount: z.number().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    groupId: z.string().nullable(),
    groupSlug: z.string().nullable(),
    groupName: z.string().nullable(),
    viewerCanAdmin: z.boolean(),
  })
  .openapi("CollectionResponse");

export const collectionListResponseSchema = z
  .object({ items: z.array(collectionResponseSchema) })
  .openapi("CollectionListResponse");

export const publicCollectionResponseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    copyCount: z.number(),
    totalValueCents: z.number().int().nullable(),
    unpricedCopyCount: z.number().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("PublicCollectionResponse");

export const collectionShareResponseSchema = z
  .object({
    // Nullable so GET /{id}/share can report an owned-but-unshared collection
    // as { shareToken: null, isPublic: false } without 404ing. POST/rotate
    // always return a non-null token; this only widens the unshared case.
    shareToken: z.string().nullable(),
    isPublic: z.boolean(),
  })
  .openapi("CollectionShareResponse");

// ── Copies ───────────────────────────────────────────────────────────────────

export const copyResponseSchema = z
  .object({
    id: z.string(),
    printingId: z.string(),
    collectionId: z.string(),
    /**
     * Owning group of the copy's collection, or null for personal collections.
     * The client uses it to keep group-owned copies out of personal "owned"
     * totals while still showing them inside the group collection.
     */
    groupId: z.string().nullable(),
  })
  .openapi("CopyResponse");

export const copyListResponseSchema = z
  .object({
    items: z.array(copyResponseSchema),
    nextCursor: z.string().nullable(),
  })
  .openapi("CopyListResponse");

/**
 * Response body for `POST /copies`: the copies just created, each carrying the
 * full {@link copyResponseSchema} shape including `groupId` (derived from the
 * owning collection). Additive — older clients read a subset and ignore the
 * extra fields.
 */
export const copyAddResponseSchema = z
  .object({ items: z.array(copyResponseSchema) })
  .openapi("CopyAddResponse");

/**
 * Response body for `POST /copies/list-memberships`: which of the viewer's own
 * lists reference the queried copies, with a per-list copy count, plus the
 * distinct number of queried copies that are on at least one list. Lets the
 * dispose confirmation warn that removing copies also strips them from these
 * lists (copies are hard-deleted and `list_entries` cascade away).
 */
export const copyListMembershipsResponseSchema = z
  .object({
    lists: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        copyCount: z.number().int().nonnegative(),
      }),
    ),
    copiesOnAnyList: z.number().int().nonnegative(),
  })
  .openapi("CopyListMembershipsResponse");

/**
 * Copy projection for anonymous share viewers — deliberately narrower than
 * {@link copyResponseSchema}: `groupId`/`collectionId` are owner-internal and
 * are withheld from unauthenticated viewers.
 */
export const publicCopyResponseSchema = z
  .object({
    id: z.string(),
    printingId: z.string(),
  })
  .openapi("PublicCopyResponse");

export const publicCollectionDetailResponseSchema = z
  .object({
    collection: publicCollectionResponseSchema,
    items: z.array(publicCopyResponseSchema),
    nextCursor: z.string().nullable(),
    owner: z.object({ displayName: z.string(), gravatarHash: z.string().nullable() }),
  })
  .openapi("PublicCollectionDetailResponse");

// ── Collection Events ────────────────────────────────────────────────────────

const collectionEventResponseSchema = z
  .object({
    id: z.string(),
    action: activityActionSchema,
    copyId: z.string().nullable(),
    printingId: z.string(),
    fromCollectionId: z.string().nullable(),
    fromCollectionName: z.string().nullable(),
    toCollectionId: z.string().nullable(),
    toCollectionName: z.string().nullable(),
    createdAt: z.string(),
    shortCode: z.string(),
    rarity: raritySchema,
    imageId: imageIdSchema.nullable(),
    cardName: z.string(),
    cardType: cardTypeSchema,
    cardSuperTypes: z.array(z.string()),
    tags: z.array(z.string()),
  })
  .openapi("CollectionEventResponse");

export const collectionEventListResponseSchema = z
  .object({
    items: z.array(collectionEventResponseSchema),
    nextCursor: z.string().nullable(),
  })
  .openapi("CollectionEventListResponse");

// ── Decks ────────────────────────────────────────────────────────────────────

// Mirrors DeckFormatConfig in shared/types/api/deck.ts. Schema stays a
// concrete object (not z.record) so TanStack's server-fn type inference can
// propagate the response shape through the client hooks.
const formatConfigSchema = z
  .object({
    tagSlugs: z.array(z.string()).optional(),
  })
  .nullable()
  .openapi({ example: { tagSlugs: ["bilgewater", "neutral"] } });

export const deckResponseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    format: deckFormatSchema,
    formatConfig: formatConfigSchema,
    isWanted: z.boolean(),
    isPublic: z.boolean(),
    shareToken: z.string().nullable(),
    isPinned: z.boolean(),
    archivedAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("DeckResponse");

export const publicDeckResponseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    format: deckFormatSchema,
    formatConfig: formatConfigSchema,
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("PublicDeckResponse");

export const deckShareResponseSchema = z
  .object({
    // Nullable so GET /decks/:id/share can report an owned-but-unshared deck
    // as { shareToken: null, isPublic: false } rather than 404ing. Share /
    // rotate always populate a string token.
    shareToken: z.string().nullable(),
    isPublic: z.boolean(),
  })
  .openapi("DeckShareResponse");

export const deckCloneResponseSchema = z
  .object({
    deckId: z.string(),
  })
  .openapi("DeckCloneResponse");

const deckSummaryResponseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    format: deckFormatSchema,
    formatConfig: formatConfigSchema,
    isPinned: z.boolean(),
    archivedAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("DeckSummaryResponse");

const deckListItemResponseSchema = z
  .object({
    deck: deckSummaryResponseSchema,
    legendCardId: z.string().nullable(),
    championCardId: z.string().nullable(),
    totalCards: z.number(),
    typeCounts: z.array(z.object({ cardType: cardTypeSchema, count: z.number() })),
    domainDistribution: z.array(z.object({ domain: domainSchema, count: z.number() })),
    isValid: z.boolean(),
    totalValueCents: z.number().int().nullable(),
  })
  .openapi("DeckListItemResponse");

export const deckListResponseSchema = z
  .object({ items: z.array(deckListItemResponseSchema) })
  .openapi("DeckListResponse");

const deckCardResponseSchema = z
  .object({
    cardId: z.string(),
    zone: deckZoneSchema,
    quantity: z.number(),
    // Optional pin to a specific printing for display. Null means "default art".
    // The handlers already return this; the schema had drifted behind the type.
    preferredPrintingId: z.string().nullable(),
  })
  .openapi("DeckCardResponse");

export const deckDetailResponseSchema = z
  .object({
    deck: deckResponseSchema,
    cards: z.array(deckCardResponseSchema),
  })
  .openapi("DeckDetailResponse");

const publicDeckCardResponseSchema = z
  .object({
    cardId: z.string(),
    zone: deckZoneSchema,
    quantity: z.number(),
    preferredPrintingId: z.string().nullable(),
    cardName: z.string(),
    cardSlug: z.string(),
    cardType: cardTypeSchema,
    superTypes: z.array(superTypeSchema),
    domains: z.array(domainSchema),
    tags: z.array(z.string()),
    keywords: z.array(z.string()),
    energy: z.number().nullable(),
    might: z.number().nullable(),
    power: z.number().nullable(),
    resolvedPrintingId: z.string().nullable(),
    shortCode: z.string().nullable(),
    imageId: z.string().nullable(),
  })
  .openapi("PublicDeckCardResponse");

const deckMatchupSwapResponseSchema = z.object({
  cardId: z.string(),
  direction: z.enum(["in", "out"]),
  quantity: z.number(),
});

const deckMatchupPlanResponseSchema = z.object({
  id: z.string(),
  opponentLegendCardId: z.string(),
  subtitle: z.string(),
  notes: z.string(),
  swaps: z.array(deckMatchupSwapResponseSchema),
});

export const deckPlanResponseSchema = z
  .object({
    generalStrategy: z.string(),
    mulliganSplit: z.boolean(),
    mulliganGeneral: z.string(),
    mulliganFirst: z.string(),
    mulliganSecond: z.string(),
    battlefieldGame1CardId: z.string().nullable(),
    battlefieldFirstCardId: z.string().nullable(),
    battlefieldSecondCardId: z.string().nullable(),
    battlefieldCustom: z.boolean(),
    battlefieldNote: z.string(),
    matchups: z.array(deckMatchupPlanResponseSchema),
  })
  .openapi("DeckPlanResponse");

export const deckPlanDetailResponseSchema = z
  .object({ plan: deckPlanResponseSchema })
  .openapi("DeckPlanDetailResponse");

const deckPlanCardMetaResponseSchema = z.object({
  cardId: z.string(),
  cardName: z.string(),
  cardSlug: z.string(),
  cardType: cardTypeSchema,
  imageId: z.string().nullable(),
});

export const publicDeckDetailResponseSchema = z
  .object({
    deck: publicDeckResponseSchema,
    cards: z.array(publicDeckCardResponseSchema),
    owner: z.object({ displayName: z.string(), gravatarHash: z.string().nullable() }),
    plan: deckPlanResponseSchema.nullable(),
    planCardMeta: z.array(deckPlanCardMetaResponseSchema),
    customTagAssignments: z.record(z.string(), z.array(z.string())).openapi({ example: {} }),
  })
  .openapi("PublicDeckDetailResponse");

const deckAvailabilityItemResponseSchema = z.object({
  cardId: z.string(),
  zone: deckZoneSchema,
  needed: z.number(),
  owned: z.number(),
  shortfall: z.number(),
});

export const deckAvailabilityResponseSchema = z
  .object({ items: z.array(deckAvailabilityItemResponseSchema) })
  .openapi("DeckAvailabilityResponse");

export const deckCardsResponseSchema = z
  .object({ cards: z.array(deckCardResponseSchema) })
  .openapi("DeckCardsResponse");

export const deckExportResponseSchema = z
  .object({
    code: z.string(),
    warnings: z.array(z.string()),
  })
  .openapi("DeckExportResponse");

// ── Preferences ──────────────────────────────────────────────────────────────

// Mirrors the CompletionScopePreference type (types/api/preferences.ts). Kept in
// sync with the write-side schema in schemas.ts (updatePreferencesSchema).
const completionScopePreferenceSchema = z
  .object({
    sets: z.array(z.string()).optional(),
    languages: z.array(z.string()).optional(),
    domains: z.array(z.string()).optional(),
    types: z.array(z.string()).optional(),
    rarities: z.array(z.string()).optional(),
    finishes: z.array(z.string()).optional(),
    artVariants: z.array(z.string()).optional(),
    promos: z.enum(["only", "exclude"]).optional(),
    signed: z.boolean().optional(),
    banned: z.boolean().optional(),
    errata: z.boolean().optional(),
  })
  .openapi("CompletionScopePreference");

export const userPreferencesResponseSchema = z
  .object({
    showImages: z.boolean().optional(),
    fancyFan: z.boolean().optional(),
    foilEffect: z.boolean().optional(),
    cardTilt: z.boolean().optional(),
    theme: z.enum(["light", "dark", "auto"]).optional(),
    palette: z.enum(["default", "minimal"]).optional(),
    marketplaceOrder: z.array(z.enum(["tcgplayer", "cardmarket", "cardtrader"])).optional(),
    // The web sends + reads these (use-preferences-sync.ts); they must round-trip.
    languages: z.array(z.string()).optional(),
    completionScope: completionScopePreferenceSchema.optional(),
    defaultCardView: z.enum(["cards", "printings"]).optional(),
    defaultCurrency: z.enum(["EUR", "USD"]).optional(),
    hiddenFilterSections: z.array(z.string()).optional(),
  })
  .openapi("UserPreferencesResponse");

// ── Trade preferences (ADR-017) ─────────────────────────────────────────────

const tradePricePrefSchema = z
  .enum(["cm_lowest", "tcg_lowest", "ct_zero", "absolute"])
  .openapi("TradePricePref");

const tradeTypeSchema = z.enum(["cards", "money", "both"]).openapi("TradeType");

const currencySchema = z.enum(["EUR", "USD"]).openapi("Currency");

const tradePreferenceSchema = z
  .object({
    pricePref: tradePricePrefSchema.nullable(),
    priceAbsoluteCents: z.number().int().positive().nullable(),
    tradeType: tradeTypeSchema.nullable(),
  })
  .openapi("TradePreference");

const effectiveTradePreferenceSchema = z
  .object({
    pricePref: tradePricePrefSchema.nullable(),
    priceAbsoluteCents: z.number().int().positive().nullable(),
    tradeType: tradeTypeSchema.nullable(),
    currency: currencySchema.nullable(),
  })
  .openapi("EffectiveTradePreference");

// ── Lists (unified wishlist / tradelist / organize) ─────────────────────────

const listIntentSchema = z.enum(["wish", "trade", "organize"]).openapi("ListIntent");

const listKindSchema = z.enum(["card", "printing", "copy"]).openapi("ListKind");

export const listResponseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    intent: listIntentSchema,
    kind: listKindSchema,
    entryCount: z.number().int().nonnegative(),
    isPublic: z.boolean(),
    shareToken: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    tradeDefaults: tradePreferenceSchema,
    currency: currencySchema.nullable(),
  })
  .openapi("ListResponse");

export const listListResponseSchema = z
  .object({ items: z.array(listResponseSchema) })
  .openapi("ListListResponse");

const listEntryBaseShape = {
  id: z.string(),
  listId: z.string(),
  quantity: z.number(),
  tradeOverride: tradePreferenceSchema,
};

export const listEntryResponseSchema = z
  .discriminatedUnion("kind", [
    z.object({ ...listEntryBaseShape, kind: z.literal("card"), cardId: z.string() }),
    z.object({ ...listEntryBaseShape, kind: z.literal("printing"), printingId: z.string() }),
    z.object({ ...listEntryBaseShape, kind: z.literal("copy"), copyId: z.string() }),
  ])
  .openapi("ListEntryResponse");

const listEntryDetailBaseShape = {
  ...listEntryBaseShape,
  cardName: z.string(),
  cardType: cardTypeSchema,
};

const listEntryDetailPrintingFieldsShape = {
  setId: z.string(),
  rarity: raritySchema,
  finish: finishSchema,
  shortCode: z.string(),
  language: z.string(),
  imageId: imageIdSchema.nullable(),
};

const listEntryDetailResponseSchema = z
  .discriminatedUnion("kind", [
    z.object({
      ...listEntryDetailBaseShape,
      kind: z.literal("card"),
      cardId: z.string(),
    }),
    z.object({
      ...listEntryDetailBaseShape,
      kind: z.literal("printing"),
      printingId: z.string(),
      ...listEntryDetailPrintingFieldsShape,
    }),
    z.object({
      ...listEntryDetailBaseShape,
      kind: z.literal("copy"),
      copyId: z.string(),
      printingId: z.string(),
      ...listEntryDetailPrintingFieldsShape,
    }),
  ])
  .openapi("ListEntryDetailResponse");

export const listDetailResponseSchema = z
  .object({
    list: listResponseSchema,
    entries: z.array(listEntryDetailResponseSchema),
  })
  .openapi("ListDetailResponse");

const publicListResponseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    intent: listIntentSchema,
    kind: listKindSchema,
    createdAt: z.string(),
    updatedAt: z.string(),
    tradeDefaults: tradePreferenceSchema,
    currency: currencySchema.nullable(),
  })
  .openapi("PublicListResponse");

export const publicListDetailResponseSchema = z
  .object({
    list: publicListResponseSchema,
    entries: z.array(listEntryDetailResponseSchema),
    owner: z.object({ displayName: z.string(), gravatarHash: z.string().nullable() }),
  })
  .openapi("PublicListDetailResponse");

export const listShareResponseSchema = z
  // shareToken is nullable so GET /lists/{id}/share can report an owned-but-
  // unshared list (shareToken: null, isPublic: false) without 404-ing. Share /
  // rotate always return a non-null token.
  .object({ shareToken: z.string().nullable(), isPublic: z.boolean() })
  .openapi("ListShareResponse");

// ── User share bundle (ADR-018) ─────────────────────────────────────────────

export const userShareStateResponseSchema = z
  .object({ shareToken: z.string().nullable(), isPublic: z.boolean() })
  .openapi("UserShareStateResponse");

const publicUserBundleListResponseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    intent: listIntentSchema,
    kind: listKindSchema,
    entryCount: z.number().int().nonnegative(),
    isPublic: z.boolean(),
    viaGroups: z.array(
      z.object({
        id: z.string(),
        slug: z.string(),
        name: z.string(),
      }),
    ),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("PublicUserBundleListResponse");

const publicUserBundleCollectionResponseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    viaGroups: z.array(
      z.object({
        id: z.string(),
        slug: z.string(),
        name: z.string(),
      }),
    ),
  })
  .openapi("PublicUserBundleCollectionResponse");

export const publicUserBundleResponseSchema = z
  .object({
    owner: z.object({
      displayName: z.string(),
      gravatarHash: z.string(),
    }),
    lists: z.array(publicUserBundleListResponseSchema),
    collections: z.array(publicUserBundleCollectionResponseSchema),
  })
  .openapi("PublicUserBundleResponse");

export const listBulkAddResponseSchema = z
  .object({
    added: z.number().int().nonnegative(),
    updated: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
  })
  .openapi("ListBulkAddResponse");

export const listMoveResponseSchema = z
  .object({
    moved: z.number().int().nonnegative(),
    merged: z.number().int().nonnegative(),
  })
  .openapi("ListMoveResponse");

// ── Rules ───────────────────────────────────────────────────────────────────

export const ruleKindSchema = z.enum(["core", "tournament"]);

const ruleResponseSchema = z.object({
  id: z.string().openapi({ example: "019cfc3b-0369-7000-8000-000000000100" }),
  kind: ruleKindSchema,
  version: z.string().openapi({ example: "1.2.0" }),
  ruleNumber: z.string().openapi({ example: "3.4.1" }),
  sortOrder: z.number().openapi({ example: 120 }),
  depth: z.number().openapi({ example: 2 }),
  ruleType: z.enum(["title", "subtitle", "text"]),
  content: z.string().openapi({
    example: "A player loses the game if they would draw a card from an empty deck.",
  }),
  changeType: z.enum(["added", "modified", "removed"]),
});

const ruleVersionResponseSchema = z.object({
  kind: ruleKindSchema,
  version: z.string().openapi({ example: "1.2.0" }),
  comments: z.string().nullable().openapi({ example: "First public release." }),
  importedAt: z.string().openapi({ example: "2026-02-16T08:30:00Z" }),
});

const ruleChangesResponseSchema = z.object({
  added: z.array(z.string()),
  modifiedPrev: z.record(z.string(), z.string()),
  removed: z.array(ruleResponseSchema),
});

export const rulesListResponseSchema = z
  .object({
    kind: ruleKindSchema,
    rules: z.array(ruleResponseSchema),
    version: z.string(),
    changes: ruleChangesResponseSchema.optional(),
  })
  .openapi("RulesListResponse");

export const ruleVersionsListResponseSchema = z
  .object({ versions: z.array(ruleVersionResponseSchema) })
  .openapi("RuleVersionsListResponse");

// ── Collection Value History ────────────────────────────────────────────────

export const collectionValueHistoryResponseSchema = z
  .object({
    series: z.array(
      z.object({
        date: z.string().openapi({ example: "2026-03-15" }),
        valueCents: z.number().int().openapi({ example: 125_000, description: "Integer cents" }),
        copyCount: z.number().openapi({ example: 42 }),
      }),
    ),
  })
  .openapi("CollectionValueHistoryResponse");

// ── Friend groups (ADR-013) ─────────────────────────────────────────────────

const friendGroupRoleSchema = z
  .enum(["owner", "admin", "judge", "member"])
  .openapi("FriendGroupRole");

export const friendGroupResponseSchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    /** Nullable when the group has disabled code-based joining. */
    code: z.string().nullable(),
    codeRotatedAt: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("FriendGroupResponse");

export const friendGroupSummaryResponseSchema = friendGroupResponseSchema
  .extend({
    viewerRole: friendGroupRoleSchema,
    memberCount: z.number().int().nonnegative(),
    pendingRequestCount: z.number().int().nonnegative(),
  })
  .openapi("FriendGroupSummaryResponse");

const friendGroupPendingInviteEntrySchema = z.object({
  id: z.string(),
  groupId: z.string(),
  groupSlug: z.string(),
  groupName: z.string(),
  createdAt: z.string(),
});

export const friendGroupListResponseSchema = z
  .object({
    items: z.array(friendGroupSummaryResponseSchema),
    pendingInvites: z.array(friendGroupPendingInviteEntrySchema),
    outgoingRequests: z.array(friendGroupPendingInviteEntrySchema),
  })
  .openapi("FriendGroupListResponse");

export const friendGroupMemberResponseSchema = z
  .object({
    userId: z.string(),
    userName: z.string().nullable(),
    userImage: z.string().nullable(),
    gravatarHash: z.string(),
    role: friendGroupRoleSchema,
    nickname: z.string().nullable(),
    joinedAt: z.string(),
  })
  .openapi("FriendGroupMemberResponse");

const friendGroupShareResponseSchema = z
  .object({
    groupId: z.string(),
    listId: z.string(),
    listName: z.string(),
    listIntent: z.enum(["wish", "trade", "organize"]),
    listKind: z.enum(["card", "printing", "copy"]),
    entryCount: z.number().int().nonnegative(),
    userId: z.string(),
    userName: z.string().nullable(),
    sharedAt: z.string(),
  })
  .openapi("FriendGroupShareResponse");

const friendGroupCollectionShareResponseSchema = z
  .object({
    groupId: z.string(),
    collectionId: z.string(),
    collectionName: z.string(),
    userId: z.string(),
    userName: z.string().nullable(),
    sharedAt: z.string(),
    copyCount: z.number().int().nonnegative(),
  })
  .openapi("FriendGroupCollectionShareResponse");

export const friendGroupRequestResponseSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    userName: z.string().nullable(),
    userImage: z.string().nullable(),
    gravatarHash: z.string(),
    createdAt: z.string(),
  })
  .openapi("FriendGroupRequestResponse");

const friendGroupViewerStatusSchema = z
  .enum(["member", "pending"])
  .openapi("FriendGroupViewerStatus");

export const friendGroupDetailResponseSchema = z
  .object({
    group: friendGroupResponseSchema,
    viewerStatus: friendGroupViewerStatusSchema,
    viewerRole: friendGroupRoleSchema.nullable(),
    members: z.array(friendGroupMemberResponseSchema),
    shares: z.array(friendGroupShareResponseSchema),
    collectionShares: z.array(friendGroupCollectionShareResponseSchema),
    pendingRequests: z.array(friendGroupRequestResponseSchema),
  })
  .openapi("FriendGroupDetailResponse");

export const friendGroupJoinPreviewResponseSchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    memberCount: z.number().int().nonnegative(),
    /**
     * `"member"` if the viewer is already in. `"pending"` if a request is
     * already queued. `"available"` otherwise.
     */
    viewerStatus: z.enum(["available", "pending", "member"]),
  })
  .openapi("FriendGroupJoinPreviewResponse");

export const friendGroupShareableListResponseSchema = z
  .object({
    listId: z.string(),
    listName: z.string(),
    listIntent: z.enum(["wish", "trade", "organize"]),
    listKind: z.enum(["card", "printing", "copy"]),
    entryCount: z.number().int().nonnegative(),
    sharedAt: z.string().nullable(),
    tradeDefaults: tradePreferenceSchema,
    currency: currencySchema.nullable(),
  })
  .openapi("FriendGroupShareableListResponse");

export const friendGroupShareableListsResponseSchema = z
  .object({ items: z.array(friendGroupShareableListResponseSchema) })
  .openapi("FriendGroupShareableListsResponse");

export const friendGroupShareableCollectionResponseSchema = z
  .object({
    collectionId: z.string(),
    collectionName: z.string(),
    sharedAt: z.string().nullable(),
  })
  .openapi("FriendGroupShareableCollectionResponse");

export const friendGroupShareableCollectionsResponseSchema = z
  .object({ items: z.array(friendGroupShareableCollectionResponseSchema) })
  .openapi("FriendGroupShareableCollectionsResponse");

const friendGroupMatchRowSchema = z
  .object({
    counterpartyUserId: z.string(),
    counterpartyName: z.string().nullable(),
    counterpartyImage: z.string().nullable(),
    counterpartyGravatarHash: z.string(),
    counterpartyNickname: z.string().nullable(),
    counterpartyListId: z.string(),
    counterpartyListName: z.string(),
    sellEntryId: z.string(),
    sellListId: z.string(),
    copyId: z.string(),
    printingId: z.string(),
    cardId: z.string(),
    cardName: z.string(),
    cardType: cardTypeSchema,
    setId: z.string(),
    rarity: raritySchema,
    finish: finishSchema,
    imageId: imageIdSchema.nullable(),
    buyEntryId: z.string(),
    buyListId: z.string(),
    buyEntryKind: z.enum(["card", "printing"]),
    buyQuantity: z.number().int().nonnegative(),
    sellPref: effectiveTradePreferenceSchema,
    buyPref: effectiveTradePreferenceSchema,
  })
  .openapi("FriendGroupMatchRow");

export const friendGroupMatchesResponseSchema = z
  .object({
    othersHaveYourWants: z.array(friendGroupMatchRowSchema),
    othersWantYourHaves: z.array(friendGroupMatchRowSchema),
  })
  .openapi("FriendGroupMatchesResponse");

export const friendGroupMemberDetailResponseSchema = z
  .object({
    member: friendGroupMemberResponseSchema,
    shares: z.array(friendGroupShareResponseSchema),
    collectionShares: z.array(friendGroupCollectionShareResponseSchema),
    matches: z.array(friendGroupMatchRowSchema),
    reverseMatches: z.array(friendGroupMatchRowSchema),
  })
  .openapi("FriendGroupMemberDetailResponse");

const friendGroupActivityEventSchema = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal("trade-completed"),
      at: z.string(),
      tradeId: z.string(),
      printingId: z.string(),
      cardId: z.string(),
      quantity: z.number().int().positive(),
      giverUserId: z.string(),
      giverName: z.string().nullable(),
      receiverUserId: z.string(),
      receiverName: z.string().nullable(),
    }),
    z.object({
      kind: z.literal("member-joined"),
      at: z.string(),
      userId: z.string(),
      userName: z.string().nullable(),
      userImage: z.string().nullable(),
      gravatarHash: z.string(),
    }),
    z.object({
      kind: z.literal("list-shared"),
      at: z.string(),
      userId: z.string(),
      userName: z.string().nullable(),
      listId: z.string(),
      listName: z.string(),
      listIntent: z.enum(["wish", "trade", "organize"]),
      listKind: z.enum(["card", "printing", "copy"]),
    }),
    z.object({
      kind: z.literal("collection-shared"),
      at: z.string(),
      userId: z.string(),
      userName: z.string().nullable(),
      collectionId: z.string(),
      collectionName: z.string(),
    }),
    z.object({
      kind: z.literal("match"),
      at: z.string(),
      counterpartyUserId: z.string(),
      counterpartyName: z.string().nullable(),
      counterpartyImage: z.string().nullable(),
      counterpartyGravatarHash: z.string(),
      printingId: z.string(),
      cardId: z.string(),
    }),
  ])
  .openapi("FriendGroupActivityEvent");

export const friendGroupActivityResponseSchema = z
  .object({ events: z.array(friendGroupActivityEventSchema) })
  .openapi("FriendGroupActivityResponse");

export const friendGroupPendingInvitesCountResponseSchema = z
  .object({ count: z.number().int().nonnegative() })
  .openapi("FriendGroupPendingInvitesCountResponse");

export const friendGroupPendingRequestsCountResponseSchema = z
  .object({ count: z.number().int().nonnegative() })
  .openapi("FriendGroupPendingRequestsCountResponse");

export const listGroupSharesResponseSchema = z
  .object({
    items: z.array(
      z.object({
        groupId: z.string(),
        groupSlug: z.string(),
        groupName: z.string(),
      }),
    ),
  })
  .openapi("ListGroupSharesResponse");

export const collectionGroupSharesResponseSchema = z
  .object({
    items: z.array(
      z.object({
        groupId: z.string(),
        groupSlug: z.string(),
        groupName: z.string(),
      }),
    ),
  })
  .openapi("CollectionGroupSharesResponse");

export const friendGroupSharedListDetailResponseSchema = z
  .object({
    list: z.object({
      id: z.string(),
      name: z.string(),
      intent: z.enum(["wish", "trade", "organize"]),
      kind: z.enum(["card", "printing", "copy"]),
      ownerUserId: z.string(),
      ownerName: z.string().nullable(),
      tradeDefaults: tradePreferenceSchema,
      currency: currencySchema.nullable(),
    }),
    entries: z.array(listEntryDetailResponseSchema),
  })
  .openapi("FriendGroupSharedListDetailResponse");

export const friendGroupSharedCollectionDetailResponseSchema = z
  .object({
    collection: z.object({
      id: z.string(),
      name: z.string(),
      description: z.string().nullable(),
      copyCount: z.number().int().nonnegative(),
      totalValueCents: z.number().int().nullable(),
      unpricedCopyCount: z.number().int().nullable(),
      ownerUserId: z.string(),
      ownerName: z.string().nullable(),
    }),
    copies: z.array(copyResponseSchema),
    viewerRole: friendGroupRoleSchema,
  })
  .openapi("FriendGroupSharedCollectionDetailResponse");

// ── Unified marketplace mappings (admin) ─────────────────────────────────────
// Concrete schemas for the two unified-mappings GETs. Authored zod-first; the
// matching TS interfaces in types/api/admin.ts are `z.infer`-ed from these so
// there is a single source of truth, and the route response schemas use these
// directly so hc can infer the web response types. The service builders
// (buildUnifiedMappingsResponse / buildUnifiedMappingsCardResponse) return the
// inferred types, so their handler output satisfies these schemas.

const marketplaceGroupKindSchema = z.enum(["basic", "special"]);

// One staged/assigned/unmatched marketplace product (a SKU + its latest prices
// and group provenance). `groupKind` / `groupSetSlug` drive the suggester.
export const stagedProductResponseSchema = z
  .object({
    externalId: z.number().openapi({ example: 748_215 }),
    productName: z.string().openapi({ example: "Jinx, Rebel (Foil)" }),
    finish: z.string().openapi({ example: "foil" }),
    /**
     * `null` when the marketplace doesn't expose language as a SKU dimension
     * (Cardmarket's cross-language price guide, TCGPlayer's English-only
     * catalog). A real language code otherwise (CardTrader).
     */
    language: z.string().nullable().openapi({ example: "EN" }),
    marketCents: z.number().nullable().openapi({ example: 452 }),
    lowCents: z.number().nullable().openapi({ example: 325 }),
    currency: z.string().openapi({ example: "USD" }),
    recordedAt: z.string().openapi({ example: "2026-04-01T12:00:00.000Z" }),
    midCents: z.number().nullable().openapi({ example: 400 }),
    highCents: z.number().nullable().openapi({ example: 600 }),
    trendCents: z.number().nullable().openapi({ example: 430 }),
    avg1Cents: z.number().nullable().openapi({ example: 445 }),
    avg7Cents: z.number().nullable().openapi({ example: 460 }),
    avg30Cents: z.number().nullable().openapi({ example: 470 }),
    isOverride: z.boolean().optional().openapi({ example: false }),
    groupId: z.number().optional().openapi({ example: 23_482 }),
    groupName: z.string().optional().openapi({ example: "Origins" }),
    /**
     * Admin-assigned tag for the marketplace group this product belongs to.
     * Drives the suggestion scorer: `basic` penalises promo/special printings,
     * `special` prefers them. Omitted for products whose group resolution
     * wasn't needed (unassigned staging without a group).
     */
    groupKind: marketplaceGroupKindSchema.optional().openapi({ example: "basic" }),
    /**
     * Slug of the OpenRift set this product's marketplace group is scoped to,
     * if any. When non-null, the suggester only proposes printings whose
     * `setId` (slug) matches. `null` means no scoping (default).
     */
    groupSetSlug: z.string().nullable().optional().openapi({ example: null }),
  })
  .openapi("StagedProductResponse");

// A single (product × printing) mapping row.
const marketplaceAssignmentResponseSchema = z
  .object({
    externalId: z.number().openapi({ example: 748_215 }),
    printingId: z.string().openapi({ example: "019cfc3b-03d3-7dac-86c9-27900cd43727" }),
    finish: z.string().openapi({ example: "foil" }),
    language: z.string().nullable().openapi({ example: "EN" }),
  })
  .openapi("MarketplaceAssignmentResponse");

const unifiedMappingPrintingResponseSchema = z
  .object({
    printingId: z.string().openapi({ example: "019cfc3b-03d3-7dac-86c9-27900cd43727" }),
    /** Slug of the printing's set, used by the suggester to scope by group.setId. */
    setId: z.string().openapi({ example: "OGN" }),
    shortCode: z.string().openapi({ example: "OGN-202" }),
    rarity: raritySchema,
    artVariant: artVariantSchema,
    isSigned: z.boolean().openapi({ example: false }),
    markerSlugs: z.array(z.string()).openapi({ example: [] }),
    finish: finishSchema,
    language: z.string().openapi({ example: "EN" }),
    imageUrl: z.string().nullable().openapi({ example: null }),
    tcgExternalId: z.number().nullable().openapi({ example: 582_391 }),
    cmExternalId: z.number().nullable().openapi({ example: 748_215 }),
    ctExternalId: z.number().nullable().openapi({ example: null }),
  })
  .openapi("UnifiedMappingPrintingResponse");

const assignableCardResponseSchema = z
  .object({
    cardId: z.string().openapi({ example: "019cfc3b-0389-744b-837c-792fd586300e" }),
    cardSlug: z.string().openapi({ example: "jinx-rebel" }),
    cardName: z.string().openapi({ example: "Jinx, Rebel" }),
    setName: z.string().openapi({ example: "Origins" }),
    /** Short codes of this card's printings (first one, sorted, is shown in the assign dropdown). */
    shortCodes: z.array(z.string()).openapi({ example: ["OGN-202"] }),
  })
  .openapi("AssignableCardResponse");

const unifiedMappingMarketplaceSchema = z.object({
  stagedProducts: z.array(stagedProductResponseSchema),
  assignedProducts: z.array(stagedProductResponseSchema),
  assignments: z.array(marketplaceAssignmentResponseSchema),
});

export const unifiedMappingGroupResponseSchema = z
  .object({
    cardId: z.string().openapi({ example: "019cfc3b-0389-744b-837c-792fd586300e" }),
    cardSlug: z.string().openapi({ example: "jinx-rebel" }),
    cardName: z.string().openapi({ example: "Jinx, Rebel" }),
    cardType: cardTypeSchema,
    superTypes: z.array(superTypeSchema).openapi({ example: ["Champion"] }),
    domains: z.array(domainSchema).openapi({ example: ["Chaos"] }),
    energy: z.number().nullable().openapi({ example: 5 }),
    might: z.number().nullable().openapi({ example: 5 }),
    setId: z.string().openapi({ example: "019cfc3b-0369-7890-a450-7859471cc3f6" }),
    setName: z.string().openapi({ example: "Origins" }),
    printings: z.array(unifiedMappingPrintingResponseSchema),
    primaryShortCode: z.string().openapi({ example: "OGN-202" }),
    tcgplayer: unifiedMappingMarketplaceSchema,
    cardmarket: unifiedMappingMarketplaceSchema,
    cardtrader: unifiedMappingMarketplaceSchema,
  })
  .openapi("UnifiedMappingGroupResponse");

export const unifiedMappingsResponseSchema = z
  .object({
    groups: z.array(unifiedMappingGroupResponseSchema),
    unmatchedProducts: z.object({
      tcgplayer: z.array(stagedProductResponseSchema),
      cardmarket: z.array(stagedProductResponseSchema),
      cardtrader: z.array(stagedProductResponseSchema),
    }),
    allCards: z.array(assignableCardResponseSchema),
  })
  .openapi("UnifiedMappingsResponse");

/** Single-card variant of {@link unifiedMappingsResponseSchema}. */
export const unifiedMappingsCardResponseSchema = z
  .object({
    /** Null when the card has no printings or no marketplace activity. */
    group: unifiedMappingGroupResponseSchema.nullable(),
    allCards: z.array(assignableCardResponseSchema),
  })
  .openapi("UnifiedMappingsCardResponse");

// ─── Card trades (ADR-019) ───────────────────────────────────────────────────

const cardTradeStatusResponseSchema = z
  .enum(["pending", "reserved", "completed", "declined", "cancelled", "expired"])
  .openapi("CardTradeStatus");

const cardTradeCounterpartySchema = z
  .object({
    userId: z.string(),
    name: z.string().nullable(),
    image: z.string().nullable(),
    gravatarHash: z.string(),
    nickname: z.string().nullable(),
  })
  .openapi("CardTradeCounterparty");

export const cardTradeResponseSchema = z
  .object({
    id: z.string(),
    groupId: z.string(),
    groupSlug: z.string(),
    role: z.enum(["giver", "receiver"]),
    initiator: z.enum(["giver", "receiver"]),
    counterparty: cardTradeCounterpartySchema,
    printingId: z.string(),
    cardId: z.string(),
    quantity: z.number().int().positive(),
    status: cardTradeStatusResponseSchema,
    createdAt: z.string(),
    updatedAt: z.string(),
    acceptedAt: z.string().nullable(),
    completedAt: z.string().nullable(),
    closedAt: z.string().nullable(),
    expiresAt: z.string().nullable(),
    viewerSyncAppliedAt: z.string().nullable(),
    counterpartySyncAppliedAt: z.string().nullable(),
    actionNeeded: z.enum(["accept-or-decline", "cancel", "complete", "apply-sync"]).nullable(),
  })
  .openapi("CardTradeResponse");

export const cardTradeListResponseSchema = z
  .object({ items: z.array(cardTradeResponseSchema) })
  .openapi("CardTradeListResponse");

export const cardTradeActionCountsResponseSchema = z
  .object({
    total: z.number().int().nonnegative(),
    byGroup: z.array(
      z.object({
        groupId: z.string(),
        groupSlug: z.string(),
        count: z.number().int().nonnegative(),
      }),
    ),
  })
  .openapi("CardTradeActionCountsResponse");

// ── Pod tournaments (ADR-022) ────────────────────────────────────────────────

const podTournamentStatusSchema = z
  .enum(["setup", "running", "completed"])
  .openapi("PodTournamentStatus");
const podScoringSchemeSchema = z.enum(["standard", "three_pod_reduced"]);
const podPlayerStatusSchema = z.enum(["active", "dropped"]);

export const podTournamentResponseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    status: podTournamentStatusSchema,
    currentRound: z.number().int().nonnegative(),
    scoringScheme: podScoringSchemeSchema,
    reportToken: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("PodTournamentResponse");

export const podTournamentSummaryResponseSchema = podTournamentResponseSchema
  .extend({
    playerCount: z.number().int().nonnegative(),
    activePlayerCount: z.number().int().nonnegative(),
    roundCount: z.number().int().nonnegative(),
  })
  .openapi("PodTournamentSummaryResponse");

export const podTournamentListResponseSchema = z
  .object({ items: z.array(podTournamentSummaryResponseSchema) })
  .openapi("PodTournamentListResponse");

export const podPlayerResponseSchema = z
  .object({
    id: z.string(),
    displayName: z.string(),
    status: podPlayerStatusSchema,
    droppedAfterRound: z.number().int().nullable(),
    createdAt: z.string(),
  })
  .openapi("PodPlayerResponse");

const podStandingRowSchema = z
  .object({
    playerId: z.string(),
    displayName: z.string(),
    status: podPlayerStatusSchema,
    droppedAfterRound: z.number().int().nullable(),
    score: z.number(),
    roundsPlayed: z.number().int().nonnegative(),
    pods3Count: z.number().int().nonnegative(),
    pods4Count: z.number().int().nonnegative(),
    byeCount: z.number().int().nonnegative(),
    podWins: z.number().int().nonnegative(),
    avgOpponentScore: z.number(),
  })
  .openapi("PodStandingRow");

const podMemberResponseSchema = z.object({
  playerId: z.string(),
  displayName: z.string(),
  placement: z.number().int().nullable(),
  points: z.number().nullable(),
});

const podPenaltyViewSchema = z.object({
  total: z.number(),
  rematchPairs: z.number().int().nonnegative(),
  spread: z.number(),
  scoreSpread: z.number(),
  imbalance: z.number(),
  float: z.number(),
  threePodRepeat: z.number(),
});

const podResponseSchema = z.object({
  id: z.string(),
  podNumber: z.number().int().positive(),
  size: z.union([z.literal(3), z.literal(4)]),
  resultStatus: z.enum(["pending", "reported"]),
  members: z.array(podMemberResponseSchema),
  penalty: podPenaltyViewSchema.nullable(),
});

const podByeResponseSchema = z.object({
  playerId: z.string(),
  displayName: z.string(),
});

const podRoundResponseSchema = z.object({
  id: z.string(),
  roundNumber: z.number().int().positive(),
  status: z.enum(["reporting", "finalized"]),
  pairingStrategy: z.string().nullable(),
  penaltyTotal: z.number().nullable(),
  createdAt: z.string(),
  finalizedAt: z.string().nullable(),
  pods: z.array(podResponseSchema),
  byes: z.array(podByeResponseSchema),
});

const podSnapshotPlayerSchema = z.object({
  playerId: z.string(),
  score: z.number(),
  pods3: z.number().int().nonnegative(),
  pods4: z.number().int().nonnegative(),
  byes: z.number().int().nonnegative(),
  opponents: z.record(z.string(), z.number().int().nonnegative()),
});

export const podTournamentDetailResponseSchema = z
  .object({
    tournament: podTournamentResponseSchema,
    players: z.array(podPlayerResponseSchema),
    standings: z.array(podStandingRowSchema),
    rounds: z.array(podRoundResponseSchema),
    openRoundSnapshot: z.array(podSnapshotPlayerSchema).nullable(),
  })
  .openapi("PodTournamentDetailResponse");

export const podReportResponseSchema = z
  .object({
    tournamentName: z.string(),
    status: podTournamentStatusSchema,
    currentRound: z.number().int().nonnegative(),
    scoringScheme: podScoringSchemeSchema,
    standings: z.array(podStandingRowSchema),
    rounds: z.array(podRoundResponseSchema),
  })
  .openapi("PodReportResponse");

export const podReportTokenResponseSchema = z
  .object({ reportToken: z.string().nullable() })
  .openapi("PodReportTokenResponse");

// ─── Deck check (ADR-025) ─────────────────────────────────────────────────────

const deckCheckEventStatusSchema = z.enum(["active", "archived"]);
const deckCheckEntryStateSchema = z.enum([
  "editable",
  "submitted",
  "approved",
  "checked",
  "withdrawn",
]);
const deckCheckReviewOutcomeSchema = z.enum(["ok", "issue"]);
const deckCheckMatchStatusSchema = z.enum(["matched", "ambiguous", "unmatched"]);
const deckCheckEntrySourceSchema = z.enum(["api", "manual", "self"]);
const deckCheckClaimSourceSchema = z.enum([
  "email_auto",
  "judge_manual",
  "self_submit",
  "claim_link",
]);

export const deckCheckEventSummaryResponseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    eventDate: z.string().nullable(),
    format: z.string().nullable(),
    allowedSets: z.array(z.string()).nullable(),
    status: deckCheckEventStatusSchema,
    entryCount: z.number().int().nonnegative(),
    checkedCount: z.number().int().nonnegative(),
    listLockMode: z.enum(["on_submit", "at_deadline"]),
    allowSelfSubmission: z.boolean(),
    submissionToken: z.string().nullable(),
    submissionsCloseAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("DeckCheckEventSummaryResponse");

export const deckCheckEventListResponseSchema = z
  .object({ items: z.array(deckCheckEventSummaryResponseSchema) })
  .openapi("DeckCheckEventListResponse");

const deckCheckEntrySummaryResponseSchema = z.object({
  id: z.string(),
  externalId: z.string(),
  source: deckCheckEntrySourceSchema,
  playerName: z.string(),
  submittedAt: z.string().nullable(),
  state: deckCheckEntryStateSchema,
  reviewOutcome: deckCheckReviewOutcomeSchema.nullable(),
  checkedByName: z.string().nullable(),
  checkedAt: z.string().nullable(),
  approvedByName: z.string().nullable(),
  approvedAt: z.string().nullable(),
  changedSinceReview: z.boolean(),
  unlockRequestedAt: z.string().nullable(),
  claimedUserName: z.string().nullable(),
  copyCount: z.number().int().nonnegative(),
  verifiedCopyCount: z.number().int().nonnegative(),
  unmatchedLineCount: z.number().int().nonnegative(),
});

export const deckCheckEventDetailResponseSchema = z
  .object({
    event: deckCheckEventSummaryResponseSchema,
    entries: z.array(deckCheckEntrySummaryResponseSchema),
  })
  .openapi("DeckCheckEventDetailResponse");

const deckCheckChangeLineSchema = z.object({
  name: z.string(),
  zone: z.string(),
  quantity: z.number().int().positive(),
});

const deckCheckChangeSummarySchema = z.object({
  added: z.array(deckCheckChangeLineSchema),
  removed: z.array(deckCheckChangeLineSchema),
  changed: z.array(
    z.object({
      name: z.string(),
      zone: z.string(),
      oldQuantity: z.number().int().positive(),
      newQuantity: z.number().int().positive(),
    }),
  ),
});

const deckCheckEntryCardResponseSchema = z.object({
  id: z.string(),
  sortOrder: z.number().int().nonnegative(),
  rawName: z.string(),
  section: z.string(),
  zone: z.enum(["main", "sideboard", "legend", "champion", "runes", "battlefield", "overflow"]),
  quantity: z.number().int().positive(),
  matchStatus: deckCheckMatchStatusSchema,
  foundCopies: z.array(z.boolean()),
  resolvedCardId: z.string().nullable(),
  resolvedPrintingId: z.string().nullable(),
});

const deckCheckEntryResponseSchema = z.object({
  id: z.string(),
  externalId: z.string(),
  source: deckCheckEntrySourceSchema,
  playerName: z.string(),
  playerEmail: z.string().nullable(),
  riotId: z.string().nullable(),
  allowDeckPublishing: z.boolean(),
  allowNameSharing: z.boolean(),
  allowRiotIdSharing: z.boolean(),
  submittedAt: z.string().nullable(),
  state: deckCheckEntryStateSchema,
  reviewOutcome: deckCheckReviewOutcomeSchema.nullable(),
  checkedBy: z.string().nullable(),
  checkedByName: z.string().nullable(),
  checkedAt: z.string().nullable(),
  approvedByName: z.string().nullable(),
  approvedAt: z.string().nullable(),
  unlockRequestedAt: z.string().nullable(),
  notes: z.string().nullable(),
  changeSummary: deckCheckChangeSummarySchema.nullable(),
  withdrawnAt: z.string().nullable(),
  claimedUserId: z.string().nullable(),
  claimedUserName: z.string().nullable(),
  claimSource: deckCheckClaimSourceSchema.nullable(),
  claimBlocked: z.boolean(),
  claimToken: z.string().nullable(),
  playerMessage: z.string().nullable(),
  updatedAt: z.string(),
});

const deckViolationSchema = z.object({
  zone: z.enum([
    "main",
    "sideboard",
    "legend",
    "champion",
    "runes",
    "battlefield",
    "overflow",
    "deck",
  ]),
  code: z.string(),
  message: z.string(),
  cardId: z.string().optional(),
});

export const deckCheckEntryDetailResponseSchema = z
  .object({
    event: deckCheckEventSummaryResponseSchema,
    entry: deckCheckEntryResponseSchema,
    cards: z.array(deckCheckEntryCardResponseSchema),
    violations: z.array(deckViolationSchema),
    typeCounts: z.array(z.object({ cardType: z.string(), count: z.number().int().nonnegative() })),
    domainDistribution: z.array(
      z.object({ domain: z.string(), count: z.number().int().nonnegative() }),
    ),
    zoneSuggestions: z.array(
      z.object({
        cardId: z.string(),
        cardName: z.string(),
        currentZone: deckZoneSchema,
        suggestedZone: deckZoneSchema,
      }),
    ),
  })
  .openapi("DeckCheckEntryDetailResponse");

export const deckCheckKeyResponseSchema = z
  .object({
    id: z.string(),
    tokenPrefix: z.string(),
    label: z.string().nullable(),
    createdByName: z.string().nullable(),
    createdAt: z.string(),
    lastUsedAt: z.string().nullable(),
    revokedAt: z.string().nullable(),
  })
  .openapi("DeckCheckKeyResponse");

export const deckCheckKeysResponseSchema = z
  .object({ items: z.array(deckCheckKeyResponseSchema) })
  .openapi("DeckCheckKeysResponse");

export const deckCheckKeyMintedResponseSchema = z
  .object({ key: deckCheckKeyResponseSchema, token: z.string() })
  .openapi("DeckCheckKeyMintedResponse");

const deckCheckIngestEntryResultSchema = z
  .object({
    externalId: z.string(),
    entryId: z.string(),
    claimUrl: z.string(),
  })
  .openapi("DeckCheckIngestEntryResult");

export const deckCheckIngestResultResponseSchema = z
  .object({
    eventId: z.string(),
    entriesCreated: z.number().int().nonnegative(),
    entriesUpdated: z.number().int().nonnegative(),
    entriesUnchanged: z.number().int().nonnegative(),
    entriesWithdrawn: z.number().int().nonnegative(),
    checksInvalidated: z.number().int().nonnegative(),
    // Deprecated: always 0 since ADR-027 removed edit-takeover; kept so
    // existing provider integrations keep parsing.
    entriesIgnored: z.number().int().nonnegative(),
    entries: z.array(deckCheckIngestEntryResultSchema),
  })
  .openapi("DeckCheckIngestResultResponse");

// ─── Deck check player self-service (ADR-026) ────────────────────────────────

const playerDeckCheckEntrySummaryResponseSchema = z.object({
  id: z.string(),
  eventName: z.string(),
  eventDate: z.string().nullable(),
  groupName: z.string(),
  groupSlug: z.string(),
  state: deckCheckEntryStateSchema,
  reviewOutcome: deckCheckReviewOutcomeSchema.nullable(),
  unlockRequested: z.boolean(),
  playerMessage: z.string().nullable(),
  submittedAt: z.string().nullable(),
  updatedAt: z.string(),
});

export const playerDeckCheckEntriesResponseSchema = z
  .object({ items: z.array(playerDeckCheckEntrySummaryResponseSchema) })
  .openapi("PlayerDeckCheckEntriesResponse");

export const playerDeckCheckEntryDetailResponseSchema = z
  .object({
    entry: z.object({
      id: z.string(),
      eventName: z.string(),
      eventDate: z.string().nullable(),
      groupName: z.string(),
      format: z.string().nullable(),
      allowedSets: z.array(z.string()).nullable(),
      state: deckCheckEntryStateSchema,
      reviewOutcome: deckCheckReviewOutcomeSchema.nullable(),
      unlockRequested: z.boolean(),
      playerMessage: z.string().nullable(),
      allowDeckPublishing: z.boolean(),
      allowNameSharing: z.boolean(),
      allowRiotIdSharing: z.boolean(),
      submittedAt: z.string().nullable(),
      submissionsCloseAt: z.string().nullable(),
      updatedAt: z.string(),
      windowOpen: z.boolean(),
      canEdit: z.boolean(),
      canUnlock: z.boolean(),
      canRequestUnlock: z.boolean(),
    }),
    cards: z.array(deckCheckEntryCardResponseSchema),
    violations: z.array(deckViolationSchema),
    typeCounts: z.array(z.object({ cardType: z.string(), count: z.number().int().nonnegative() })),
    domainDistribution: z.array(
      z.object({ domain: z.string(), count: z.number().int().nonnegative() }),
    ),
  })
  .openapi("PlayerDeckCheckEntryDetailResponse");

export const deckCheckSubmissionPageResponseSchema = z
  .object({
    eventName: z.string(),
    eventDate: z.string().nullable(),
    groupName: z.string(),
    format: z.string().nullable(),
    allowedSets: z.array(z.string()).nullable(),
    submissionsCloseAt: z.string().nullable(),
    submissionsOpen: z.boolean(),
    linkedEntry: z
      .object({
        id: z.string(),
        state: deckCheckEntryStateSchema,
        canReplace: z.boolean(),
        allowDeckPublishing: z.boolean(),
        allowNameSharing: z.boolean(),
        allowRiotIdSharing: z.boolean(),
      })
      .nullable(),
  })
  .openapi("DeckCheckSubmissionPageResponse");

export const deckCheckSubmissionResultResponseSchema = z
  .object({
    entryId: z.string().nullable(),
    cards: z.array(deckCheckEntryCardResponseSchema),
    violations: z.array(deckViolationSchema),
  })
  .openapi("DeckCheckSubmissionResultResponse");

export const deckCheckAccountSearchResponseSchema = z
  .object({
    items: z.array(z.object({ id: z.string(), name: z.string().nullable(), email: z.string() })),
  })
  .openapi("DeckCheckAccountSearchResponse");

export const deckCheckClaimLandingResponseSchema = z
  .object({
    eventName: z.string(),
    groupName: z.string(),
  })
  .openapi("DeckCheckClaimLandingResponse");

export const deckCheckClaimResultResponseSchema = z
  .object({
    status: z.enum(["claimed", "already", "conflict", "blocked"]),
    entryId: z.string().nullable(),
  })
  .openapi("DeckCheckClaimResultResponse");

export const deckCheckReResolveResponseSchema = z
  .object({ updatedLines: z.number().int().nonnegative() })
  .openapi("DeckCheckReResolveResponse");
