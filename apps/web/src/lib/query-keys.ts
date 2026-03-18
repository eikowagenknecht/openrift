import type { TimeRange } from "@openrift/shared";

import type { SourceMappingConfig } from "@/components/admin/price-mappings-types";

export const queryKeys = {
  featureFlags: {
    all: ["feature-flags"] as const,
  },
  catalog: {
    all: ["catalog"] as const,
  },
  collections: {
    all: ["collections"] as const,
  },
  copies: {
    all: ["copies"] as const,
    byCollection: (id: string) => ["copies", id] as const,
  },
  sources: {
    all: ["sources"] as const,
  },
  ownedCount: {
    all: ["ownedCount"] as const,
  },
  priceHistory: {
    byPrinting: (printingId: string, range: TimeRange) =>
      ["priceHistory", printingId, range] as const,
  },
  admin: {
    me: ["admin", "me"] as const,
    sets: ["admin", "sets"] as const,
    cardSources: {
      all: ["admin", "card-sources"] as const,
      list: ["admin", "card-sources", "list"] as const,
      detail: (cardId: string) => ["admin", "card-sources", "detail", cardId] as const,
      unmatched: (name: string) => ["admin", "card-sources", "unmatched", name] as const,
      allCards: ["admin", "card-sources", "all-cards"] as const,
      sourceNames: ["admin", "card-sources", "source-names"] as const,
      sourceStats: ["admin", "card-sources", "source-stats"] as const,
    },
    marketplaceGroups: ["admin", "marketplace-groups"] as const,
    featureFlags: ["admin", "feature-flags"] as const,
    cronStatus: ["admin", "cron-status"] as const,
    rehostStatus: ["admin", "rehost-status"] as const,
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
    ignoredSources: ["admin", "ignored-sources"] as const,
    promoTypes: ["admin", "promo-types"] as const,
    sourceSettings: ["admin", "source-settings"] as const,
  },
} as const;
