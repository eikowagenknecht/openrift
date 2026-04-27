// oxlint-disable-next-line import/no-unassigned-import -- type augmentation: adds .openapi() to Zod schemas
import "@asteasolutions/zod-to-openapi";
import { z } from "zod";

// ── Enums ────────────────────────────────────────────────────────────────────

const cardTypeSchema = z.string().openapi({ example: "Unit" });
const raritySchema = z.string().openapi({ example: "Epic" });
const domainSchema = z.string().openapi({ example: "Chaos" });
const superTypeSchema = z.string().openapi({ example: "Champion" });
const artVariantSchema = z.string().openapi({ example: "normal" });
const finishSchema = z.string().openapi({ example: "foil" });
const activityActionSchema = z.enum(["added", "removed", "moved"]);
const deckFormatSchema = z.enum(["constructed", "freeform"]);
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
    items: z.record(z.string(), z.boolean()).openapi({
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
    }),
    keywords: z.record(z.string(), keywordEntrySchema),
  })
  .openapi("InitResponse");

// ── Prices ───────────────────────────────────────────────────────────────────

const marketplacePriceMapSchema = z.object({
  tcgplayer: z.number().optional().openapi({ example: 4.52 }),
  cardmarket: z.number().optional().openapi({ example: 3.8 }),
  cardtrader: z.number().optional().openapi({ example: 3.9 }),
});

export const pricesResponseSchema = z
  .object({
    prices: z.record(z.string(), marketplacePriceMapSchema).openapi({
      example: {
        "019cfc3b-03d3-7dac-86c9-27900cd43727": {
          tcgplayer: 4.52,
          cardmarket: 3.8,
          cardtrader: 3.9,
        },
      },
    }),
  })
  .openapi("PricesResponse");

const tcgplayerSnapshotSchema = z.object({
  date: z.string().openapi({ example: "2026-04-01" }),
  market: z.number().openapi({ example: 4.52 }),
  low: z.number().nullable().openapi({ example: 3.25 }),
});

const cardmarketSnapshotSchema = z.object({
  date: z.string().openapi({ example: "2026-04-01" }),
  market: z.number().openapi({ example: 3.8 }),
  low: z.number().nullable().openapi({ example: 2.5 }),
});

const cardtraderSnapshotSchema = z.object({
  date: z.string().openapi({ example: "2026-04-01" }),
  zeroLow: z.number().nullable().openapi({ example: 4.2 }),
  low: z.number().nullable().openapi({ example: 3.9 }),
});

const marketplaceInfoSchema = z.object({
  available: z.boolean().openapi({ example: true }),
  productId: z.number().nullable().openapi({ example: 582_391 }),
});

export const priceHistoryResponseSchema = z
  .object({
    tcgplayer: marketplaceInfoSchema.extend({ snapshots: z.array(tcgplayerSnapshotSchema) }),
    cardmarket: marketplaceInfoSchema.extend({ snapshots: z.array(cardmarketSnapshotSchema) }),
    cardtrader: marketplaceInfoSchema.extend({ snapshots: z.array(cardtraderSnapshotSchema) }),
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

const distributionChannelSchema = z.object({
  id: z.string().openapi({ example: "019cfc3b-0369-7000-8000-000000000002" }),
  slug: z.string().openapi({ example: "nexus-night" }),
  label: z.string().openapi({ example: "Nexus Night" }),
  description: z.string().nullable().openapi({ example: null }),
  kind: z.enum(["event", "product"]).openapi({ example: "event" }),
  parentId: z.string().nullable().openapi({ example: null }),
  childrenLabel: z.string().nullable().openapi({ example: null }),
});

const printingDistributionChannelSchema = z.object({
  channel: distributionChannelSchema,
  distributionNote: z.string().nullable().openapi({ example: null }),
  ancestorLabels: z.array(z.string()).openapi({ example: [] }),
});

const cardImageVariantsSchema = z.object({
  full: z
    .string()
    .openapi({ example: "/media/cards/be/019d02f1-d14f-769f-9295-9852db692dbe-full.webp" }),
  thumbnail: z
    .string()
    .openapi({ example: "/media/cards/be/019d02f1-d14f-769f-9295-9852db692dbe-400w.webp" }),
});

const printingImageSchema = z.object({
  face: cardFaceSchema,
  full: z
    .string()
    .openapi({ example: "/media/cards/be/019d02f1-d14f-769f-9295-9852db692dbe-full.webp" }),
  thumbnail: z
    .string()
    .openapi({ example: "/media/cards/be/019d02f1-d14f-769f-9295-9852db692dbe-400w.webp" }),
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
  language: z.string().openapi({ example: "EN" }),
  comment: z.string().nullable().openapi({ example: null }),
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
  })
  .openapi("CatalogResponse");

// ── Card Detail ─────────────────────────────────────────────────────────────

export const cardDetailResponseSchema = z
  .object({
    card: catalogCardResponseSchema,
    printings: z.array(catalogPrintingResponseSchema),
    sets: z.array(catalogSetResponseSchema),
    prices: z.record(z.string(), marketplacePriceMapSchema),
  })
  .openapi("CardDetailResponse");

// ── Sets ────────────────────────────────────────────────────────────────────

const setListEntrySchema = catalogSetResponseSchema.extend({
  cardCount: z.number().openapi({ example: 312 }),
  printingCount: z.number().openapi({ example: 468 }),
  coverImage: cardImageVariantsSchema.nullable(),
});

export const setListResponseSchema = z
  .object({ sets: z.array(setListEntrySchema) })
  .openapi("SetListResponse");

export const setDetailResponseSchema = z
  .object({
    set: catalogSetResponseSchema,
    cards: z.record(z.string(), catalogCardResponseSchema),
    printings: z.array(catalogPrintingResponseSchema),
    prices: z.record(z.string(), marketplacePriceMapSchema),
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
    prices: z.record(z.string(), marketplacePriceMapSchema),
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
    shareToken: z.string().nullable(),
    copyCount: z.number(),
    totalValueCents: z.number().nullable(),
    unpricedCopyCount: z.number().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("CollectionResponse");

export const collectionListResponseSchema = z
  .object({ items: z.array(collectionResponseSchema) })
  .openapi("CollectionListResponse");

// ── Copies ───────────────────────────────────────────────────────────────────

const copyResponseSchema = z
  .object({
    id: z.string(),
    printingId: z.string(),
    collectionId: z.string(),
  })
  .openapi("CopyResponse");

export const copyListResponseSchema = z
  .object({
    items: z.array(copyResponseSchema),
    nextCursor: z.string().nullable(),
  })
  .openapi("CopyListResponse");

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
    image: cardImageVariantsSchema.nullable(),
    cardName: z.string(),
    cardType: cardTypeSchema,
    cardSuperTypes: z.array(z.string()),
  })
  .openapi("CollectionEventResponse");

export const collectionEventListResponseSchema = z
  .object({
    items: z.array(collectionEventResponseSchema),
    nextCursor: z.string().nullable(),
  })
  .openapi("CollectionEventListResponse");

// ── Decks ────────────────────────────────────────────────────────────────────

export const deckResponseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    format: deckFormatSchema,
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
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("PublicDeckResponse");

export const deckShareResponseSchema = z
  .object({
    shareToken: z.string(),
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
    totalValueCents: z.number().nullable(),
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
    thumbnailUrl: z.string().nullable(),
    fullImageUrl: z.string().nullable(),
  })
  .openapi("PublicDeckCardResponse");

export const publicDeckDetailResponseSchema = z
  .object({
    deck: publicDeckResponseSchema,
    cards: z.array(publicDeckCardResponseSchema),
    owner: z.object({ displayName: z.string() }),
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

const deckImportCardPreviewSchema = z.object({
  cardId: z.string(),
  shortCode: z.string(),
  zone: deckZoneSchema,
  quantity: z.number(),
  cardName: z.string(),
  cardType: cardTypeSchema,
  superTypes: z.array(superTypeSchema),
  domains: z.array(domainSchema),
});

export const deckImportPreviewResponseSchema = z
  .object({
    cards: z.array(deckImportCardPreviewSchema),
    warnings: z.array(z.string()),
  })
  .openapi("DeckImportPreviewResponse");

// ── Preferences ──────────────────────────────────────────────────────────────

export const userPreferencesResponseSchema = z
  .object({
    showImages: z.boolean().optional(),
    fancyFan: z.boolean().optional(),
    foilEffect: z.boolean().optional(),
    cardTilt: z.boolean().optional(),
    theme: z.enum(["light", "dark", "auto"]).optional(),
    marketplaceOrder: z.array(z.enum(["tcgplayer", "cardmarket", "cardtrader"])).optional(),
    defaultCardView: z.enum(["cards", "printings"]).optional(),
  })
  .openapi("UserPreferencesResponse");

// ── Wish Lists ───────────────────────────────────────────────────────────────

export const wishListResponseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    rules: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean()]).nullable())
      .nullable(),
    shareToken: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("WishListResponse");

export const wishListListResponseSchema = z
  .object({ items: z.array(wishListResponseSchema) })
  .openapi("WishListListResponse");

export const wishListItemResponseSchema = z
  .object({
    id: z.string(),
    wishListId: z.string(),
    cardId: z.string().nullable(),
    printingId: z.string().nullable(),
    quantityDesired: z.number(),
  })
  .openapi("WishListItemResponse");

export const wishListDetailResponseSchema = z
  .object({
    wishList: wishListResponseSchema,
    items: z.array(wishListItemResponseSchema),
  })
  .openapi("WishListDetailResponse");

// ── Trade Lists ──────────────────────────────────────────────────────────────

export const tradeListResponseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    rules: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean()]).nullable())
      .nullable(),
    shareToken: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("TradeListResponse");

export const tradeListListResponseSchema = z
  .object({ items: z.array(tradeListResponseSchema) })
  .openapi("TradeListListResponse");

export const tradeListItemResponseSchema = z.object({
  id: z.string(),
  tradeListId: z.string(),
  copyId: z.string(),
});

const tradeListItemDetailResponseSchema = z
  .object({
    id: z.string(),
    tradeListId: z.string(),
    copyId: z.string(),
    printingId: z.string(),
    collectionId: z.string(),
    image: cardImageVariantsSchema.nullable(),
    setId: z.string(),
    rarity: raritySchema,
    finish: finishSchema,
    cardName: z.string(),
    cardType: cardTypeSchema,
  })
  .openapi("TradeListItemDetailResponse");

export const tradeListDetailResponseSchema = z
  .object({
    tradeList: tradeListResponseSchema,
    items: z.array(tradeListItemDetailResponseSchema),
  })
  .openapi("TradeListDetailResponse");

// ── Shopping List ────────────────────────────────────────────────────────────

const shoppingListSourceResponseSchema = z.object({
  source: z.string(),
  demandSourceId: z.string(),
  sourceName: z.string(),
  needed: z.number(),
});

const shoppingListItemResponseSchema = z.object({
  cardId: z.string().nullable(),
  printingId: z.string().nullable(),
  totalDemand: z.number(),
  owned: z.number(),
  stillNeeded: z.number(),
  sources: z.array(shoppingListSourceResponseSchema),
});

export const shoppingListResponseSchema = z
  .object({ items: z.array(shoppingListItemResponseSchema) })
  .openapi("ShoppingListResponse");

// ── Rules ───────────────────────────────────────────────────────────────────

const ruleResponseSchema = z.object({
  id: z.string().openapi({ example: "019cfc3b-0369-7000-8000-000000000100" }),
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
  version: z.string().openapi({ example: "1.2.0" }),
  sourceType: z.string().openapi({ example: "pdf" }),
  sourceUrl: z.string().nullable().openapi({ example: "https://example.com/rules-1.2.0.pdf" }),
  publishedAt: z.string().nullable().openapi({ example: "2026-02-15" }),
  importedAt: z.string().openapi({ example: "2026-02-16T08:30:00Z" }),
});

export const rulesListResponseSchema = z
  .object({
    rules: z.array(ruleResponseSchema),
    version: z.string(),
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
        value: z.number().openapi({ example: 1250 }),
        copyCount: z.number().openapi({ example: 42 }),
      }),
    ),
  })
  .openapi("CollectionValueHistoryResponse");
