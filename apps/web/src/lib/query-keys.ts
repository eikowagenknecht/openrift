import type { TimeRange } from "@openrift/shared";

import type { SourceMappingConfig } from "@/components/admin/price-mappings-types";

export const queryKeys = {
  featureFlags: {
    all: ["feature-flags"] as const,
  },
  siteSettings: {
    all: ["site-settings"] as const,
  },
  catalog: {
    all: ["catalog"] as const,
  },
  enums: {
    all: ["enums"] as const,
  },
  keywordStyles: {
    all: ["keyword-styles"] as const,
  },
  collections: {
    all: ["collections"] as const,
  },
  preferences: {
    all: ["preferences"] as const,
  },
  copies: {
    all: ["copies"] as const,
    byCollection: (id: string) => ["copies", id] as const,
  },
  acquisitionSources: {
    all: ["acquisition-sources"] as const,
  },
  collectionEvents: {
    all: ["collection-events"] as const,
  },
  ownedCount: {
    all: ["ownedCount"] as const,
    byCollection: (printingId: string) => ["ownedCount", "byCollection", printingId] as const,
  },
  priceHistory: {
    byPrinting: (printingId: string, range: TimeRange) =>
      ["priceHistory", printingId, range] as const,
  },
  decks: {
    all: ["decks"] as const,
    detail: (id: string) => ["decks", id] as const,
    availability: (id: string) => ["decks", id, "availability"] as const,
  },
  rules: {
    all: ["rules"] as const,
    versions: ["rules", "versions"] as const,
    byVersion: (version: string) => ["rules", version] as const,
    search: (query: string) => ["rules", "search", query] as const,
  },
  admin: {
    me: ["admin", "me"] as const,
    sets: ["admin", "sets"] as const,
    cards: {
      all: ["admin", "cards"] as const,
      list: ["admin", "cards", "list"] as const,
      detail: (cardId: string) => ["admin", "cards", "detail", cardId] as const,
      unmatched: (name: string) => ["admin", "cards", "unmatched", name] as const,
      allCards: ["admin", "cards", "all-cards"] as const,
      providerNames: ["admin", "cards", "provider-names"] as const,
      providerStats: ["admin", "cards", "provider-stats"] as const,
    },
    marketplaceGroups: ["admin", "marketplace-groups"] as const,
    featureFlags: ["admin", "feature-flags"] as const,
    featureFlagOverrides: ["admin", "feature-flag-overrides"] as const,
    siteSettings: ["admin", "site-settings"] as const,
    status: ["admin", "status"] as const,
    cronStatus: ["admin", "cron-status"] as const,
    rehostStatus: ["admin", "rehost-status"] as const,
    renamePreview: ["admin", "rename-preview"] as const,
    brokenImages: ["admin", "broken-images"] as const,
    lowResImages: ["admin", "low-res-images"] as const,
    missingImages: ["admin", "missing-images"] as const,
    priceMappings: {
      bySource: (config: SourceMappingConfig) => ["admin", config.source] as const,
      bySourceAndFilter: (config: SourceMappingConfig, showAll: boolean) =>
        ["admin", config.source, "mappings", { all: showAll }] as const,
    },
    unifiedMappings: {
      all: ["admin", "unified-mappings"] as const,
      byFilter: (showAll: boolean) => ["admin", "unified-mappings", { all: showAll }] as const,
    },
    ignoredProducts: ["admin", "ignored-products"] as const,
    ignoredCandidates: ["admin", "ignored-candidates"] as const,
    deckZones: ["admin", "deck-zones"] as const,
    languages: ["admin", "languages"] as const,
    formats: ["admin", "formats"] as const,
    promoTypes: ["admin", "promo-types"] as const,
    distinctArtists: ["admin", "distinct-artists"] as const,
    providerSettings: ["admin", "provider-settings"] as const,
    cardBans: Object.assign((cardId: string) => ["admin", "card-bans", cardId] as const, {
      prefix: ["admin", "card-bans"] as const,
    }),
    cardErrata: Object.assign((cardId: string) => ["admin", "card-errata", cardId] as const, {
      prefix: ["admin", "card-errata"] as const,
    }),
    keywordStats: ["admin", "keyword-stats"] as const,
    typographyReview: ["admin", "typography-review"] as const,
    rules: {
      versions: ["admin", "rules", "versions"] as const,
    },
    users: ["admin", "users"] as const,
  },
} as const;
