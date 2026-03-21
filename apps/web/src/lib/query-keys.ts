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
  acquisitionSources: {
    all: ["acquisition-sources"] as const,
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
    candidates: {
      all: ["admin", "candidates"] as const,
      list: ["admin", "candidates", "list"] as const,
      detail: (cardId: string) => ["admin", "candidates", "detail", cardId] as const,
      unmatched: (name: string) => ["admin", "candidates", "unmatched", name] as const,
      allCards: ["admin", "candidates", "all-cards"] as const,
      providerNames: ["admin", "candidates", "provider-names"] as const,
      providerStats: ["admin", "candidates", "provider-stats"] as const,
    },
    marketplaceGroups: ["admin", "marketplace-groups"] as const,
    featureFlags: ["admin", "feature-flags"] as const,
    cronStatus: ["admin", "cron-status"] as const,
    rehostStatus: ["admin", "rehost-status"] as const,
    renamePreview: ["admin", "rename-preview"] as const,
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
    promoTypes: ["admin", "promo-types"] as const,
    providerSettings: ["admin", "provider-settings"] as const,
  },
} as const;
