import type { TimeRange } from "@openrift/shared/types/pricing";

export const catalogKeys = {
  all: ["catalog"] as const,
  none: ["catalog", "none"] as const,
} as const;

export const pricesKeys = {
  all: ["prices"] as const,
} as const;

export const cardsKeys = {
  detail: (slug: string) => ["card-detail", slug] as const,
} as const;

export const setsKeys = {
  all: ["sets"] as const,
  detail: (slug: string) => ["sets", slug] as const,
} as const;

export const promosKeys = {
  all: ["promos"] as const,
  forLanguage: (language: string) => ["promos", language] as const,
} as const;

export const productsKeys = {
  all: ["products"] as const,
  detail: (slug: string) => ["products", slug] as const,
} as const;

export const ownedCountKeys = {
  all: ["ownedCount"] as const,
} as const;

export const priceHistoryKeys = {
  byPrinting: (printingId: string, range: TimeRange) =>
    ["priceHistory", printingId, range] as const,
} as const;

export const marketplaceInfoKeys = {
  byPrintings: (printingIds: readonly string[]) => ["marketplaceInfo", printingIds] as const,
} as const;
