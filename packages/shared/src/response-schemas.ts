// oxlint-disable-next-line import/no-unassigned-import -- type augmentation: adds .openapi() to Zod schemas
import "@asteasolutions/zod-to-openapi";
import { z } from "zod";

// ── Enums ────────────────────────────────────────────────────────────────────

const cardTypeSchema = z.string();
const raritySchema = z.string();
const domainSchema = z.string();
const superTypeSchema = z.string();
const artVariantSchema = z.string();
const finishSchema = z.string();
const activityActionSchema = z.enum(["added", "removed", "moved"]);
const deckFormatSchema = z.enum(["standard", "freeform"]);
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

export const healthResponseSchema = z.object({ status: z.string() }).openapi("HealthResponse");

// ── Admin Status ────────────────────────────────────────────────────────────

const cronJobStatusSchema = z.object({
  enabled: z.boolean(),
  nextRun: z.string().nullable(),
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
      enabled: z.boolean(),
      jobs: z.object({
        tcgplayer: cronJobStatusSchema,
        cardmarket: cronJobStatusSchema,
        cardtrader: cronJobStatusSchema,
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
      totalSnapshots: z.number(),
      sources: z.array(
        z.object({
          marketplace: z.string(),
          products: z.number(),
          snapshots: z.number(),
          latestSnapshot: z.string().nullable(),
          stagingRows: z.number(),
          latestStaging: z.string().nullable(),
        }),
      ),
    }),
  })
  .openapi("AdminStatusResponse");

// ── Feature Flags ────────────────────────────────────────────────────────────

export const featureFlagsResponseSchema = z
  .object({ items: z.record(z.string(), z.boolean()) })
  .openapi("FeatureFlagsResponse");

// ── Keyword Styles ───────────────────────────────────────────────────────────

const keywordStyleEntrySchema = z.object({
  color: z.string(),
  darkText: z.boolean(),
});

export const keywordStylesResponseSchema = z
  .object({ items: z.record(z.string(), keywordStyleEntrySchema) })
  .openapi("KeywordStylesResponse");

// ── Prices ───────────────────────────────────────────────────────────────────

export const pricesResponseSchema = z
  .object({ prices: z.record(z.string(), z.number()) })
  .openapi("PricesResponse");

const tcgplayerSnapshotSchema = z.object({
  date: z.string(),
  market: z.number(),
  low: z.number().nullable(),
  mid: z.number().nullable(),
  high: z.number().nullable(),
});

const cardmarketSnapshotSchema = z.object({
  date: z.string(),
  market: z.number(),
  low: z.number().nullable(),
  trend: z.number().nullable(),
  avg1: z.number().nullable(),
  avg7: z.number().nullable(),
  avg30: z.number().nullable(),
});

const cardtraderSnapshotSchema = z.object({
  date: z.string(),
  market: z.number(),
});

export const priceHistoryResponseSchema = z
  .object({
    printingId: z.string(),
    tcgplayer: z.object({
      available: z.boolean(),
      currency: z.literal("USD"),
      productId: z.number().nullable(),
      snapshots: z.array(tcgplayerSnapshotSchema),
    }),
    cardmarket: z.object({
      available: z.boolean(),
      currency: z.literal("EUR"),
      productId: z.number().nullable(),
      snapshots: z.array(cardmarketSnapshotSchema),
    }),
    cardtrader: z.object({
      available: z.boolean(),
      currency: z.literal("EUR"),
      productId: z.number().nullable(),
      snapshots: z.array(cardtraderSnapshotSchema),
    }),
  })
  .openapi("PriceHistoryResponse");

// ── Catalog ──────────────────────────────────────────────────────────────────

const catalogSetResponseSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
});

const promoTypeSchema = z.object({
  id: z.string(),
  slug: z.string(),
  label: z.string(),
});

const printingImageSchema = z.object({
  face: cardFaceSchema,
  url: z.string(),
});

const cardBanSchema = z.object({
  formatId: z.string(),
  formatName: z.string(),
  bannedAt: z.string(),
  reason: z.string().nullable(),
});

const catalogCardResponseSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  type: cardTypeSchema,
  superTypes: z.array(superTypeSchema),
  domains: z.array(domainSchema),
  might: z.number().nullable(),
  energy: z.number().nullable(),
  power: z.number().nullable(),
  keywords: z.array(z.string()),
  tags: z.array(z.string()),
  mightBonus: z.number().nullable(),
  errata: z
    .object({
      correctedRulesText: z.string().nullable(),
      correctedEffectText: z.string().nullable(),
      source: z.string(),
      sourceUrl: z.string().nullable(),
      effectiveDate: z.string().nullable(),
    })
    .nullable(),
  bans: z.array(cardBanSchema),
});

const catalogPrintingResponseSchema = z.object({
  id: z.string(),
  shortCode: z.string(),
  setId: z.string(),
  rarity: raritySchema,
  artVariant: artVariantSchema,
  isSigned: z.boolean(),
  promoType: promoTypeSchema.nullable(),
  finish: finishSchema,
  images: z.array(printingImageSchema),
  artist: z.string(),
  publicCode: z.string(),
  printedRulesText: z.string().nullable(),
  printedEffectText: z.string().nullable(),
  flavorText: z.string().nullable(),
  printedName: z.string().nullable(),
  language: z.string(),
  marketPrice: z.number().optional(),
  cardId: z.string(),
});

const catalogLanguageResponseSchema = z.object({
  code: z.string(),
  name: z.string(),
});

export const catalogResponseSchema = z
  .object({
    sets: z.array(catalogSetResponseSchema),
    cards: z.record(z.string(), catalogCardResponseSchema),
    printings: z.array(catalogPrintingResponseSchema),
    totalCopies: z.number(),
    languages: z.array(catalogLanguageResponseSchema),
  })
  .openapi("CatalogResponse");

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

export const copyResponseSchema = z
  .object({
    id: z.string(),
    printingId: z.string(),
    collectionId: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("CopyResponse");

export const copyListResponseSchema = z
  .object({
    items: z.array(copyResponseSchema),
    nextCursor: z.string().nullable(),
  })
  .openapi("CopyListResponse");

export const copyCountResponseSchema = z
  .object({ items: z.record(z.string(), z.number()) })
  .openapi("CopyCountResponse");

const copyCollectionBreakdownEntrySchema = z.object({
  collectionId: z.string(),
  collectionName: z.string(),
  count: z.number(),
});

export const copyCollectionBreakdownResponseSchema = z
  .object({ items: z.array(copyCollectionBreakdownEntrySchema) })
  .openapi("CopyCollectionBreakdownResponse");

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
    imageUrl: z.string().nullable(),
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
    format: deckFormatSchema,
  })
  .openapi("DeckResponse");

const deckSummaryResponseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    format: deckFormatSchema,
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
    imageUrl: z.string().nullable(),
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
  id: z.string(),
  version: z.string(),
  ruleNumber: z.string(),
  sortOrder: z.number(),
  depth: z.number(),
  ruleType: z.enum(["title", "subtitle", "text"]),
  content: z.string(),
  changeType: z.enum(["added", "modified", "removed"]),
});

const ruleVersionResponseSchema = z.object({
  version: z.string(),
  sourceType: z.string(),
  sourceUrl: z.string().nullable(),
  publishedAt: z.string().nullable(),
  importedAt: z.string(),
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
