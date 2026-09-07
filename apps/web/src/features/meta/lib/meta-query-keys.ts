import type { MetaCountsQuery, MetaScopeQuery } from "@openrift/shared/types/api/meta";

import type { MetaDateRange, MetaDeckQuery } from "@/features/meta/lib/meta-scope";

// An absent filter and one that narrows nothing share the unscoped key, so
// they don't cache the same fetch twice.
function metaFilterKey<T extends object>(
  base: readonly string[],
  filter: T | undefined,
  fields: readonly (keyof T)[],
): readonly unknown[] {
  if (filter === undefined || fields.every((field) => filter[field] === undefined)) {
    return base;
  }
  return [...base, Object.fromEntries(fields.map((field) => [field, filter[field] ?? null]))];
}

const RANGE_FIELDS = ["from", "to"] as const;

const SCOPE_FIELDS = [
  "from",
  "to",
  "formats",
  "formatsEx",
  "tiers",
  "tiersEx",
  "countries",
  "countriesEx",
] as const;

const DECK_QUERY_FIELDS = [...SCOPE_FIELDS, "legend", "player", "limit"] as const;

const COUNTS_QUERY_FIELDS = ["format", "dateFrom", "dateTo"] as const;

const LEGEND_QUERY_FIELDS = [...SCOPE_FIELDS, "page"] as const;

// Admin mutations invalidate the `all` prefix: every public read
// denormalizes event fields, so any write can stale any of them.
export const metaKeys = {
  all: ["meta"] as const,
  events: (range?: MetaDateRange) => metaFilterKey(["meta", "events"], range, RANGE_FIELDS),
  activity: ["meta", "activity"] as const,
  counts: (query?: MetaCountsQuery) =>
    metaFilterKey(["meta", "counts"], query, COUNTS_QUERY_FIELDS),
  event: (slug: string) => ["meta", "events", slug] as const,
  decks: (query?: MetaDeckQuery) => metaFilterKey(["meta", "decks"], query, DECK_QUERY_FIELDS),
  deckCards: (range?: MetaDateRange) => metaFilterKey(["meta", "deck-cards"], range, RANGE_FIELDS),
  deck: (token: string) => ["meta", "decks", token] as const,
  legends: ["meta", "legends"] as const,
  legend: (slug: string, query?: MetaScopeQuery & { page?: number }) =>
    metaFilterKey(["meta", "legends", slug], query, LEGEND_QUERY_FIELDS),
  player: (key: string) => ["meta", "players", key] as const,
} as const;

export const metaSubmissionsKeys = {
  all: (userId: string) => ["meta-submissions", userId] as const,
  creditVisibility: (userId: string) => ["meta-submissions", userId, "credit"] as const,
} as const;
