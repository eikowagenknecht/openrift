import type { CandidateStatus, TimeRange } from "@openrift/shared";

import type { SourceMappingConfig } from "@/components/admin/price-mappings-types";

export const queryKeys = {
  cards: {
    all: ["cards"] as const,
    prices: ["prices"] as const,
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
    candidates: {
      all: ["admin", "candidates"] as const,
      byFilter: (tab: "new" | "updates", status: CandidateStatus) =>
        ["admin", "candidates", tab, status] as const,
    },
    cardmarketExpansions: ["admin", "cardmarket-expansions"] as const,
    tcgplayerGroups: ["admin", "tcgplayer-groups"] as const,
    cronStatus: ["admin", "cron-status"] as const,
    rehostStatus: ["admin", "rehost-status"] as const,
    priceMappings: {
      bySource: (config: SourceMappingConfig) => ["admin", config.source] as const,
      bySourceAndFilter: (config: SourceMappingConfig, showAll: boolean) =>
        ["admin", config.source, "mappings", { all: showAll }] as const,
    },
  },
} as const;
