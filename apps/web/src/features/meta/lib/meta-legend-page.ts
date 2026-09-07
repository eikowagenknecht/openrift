import type { MetaEventSummary, MetaLegendSummary } from "@openrift/shared/types/api/meta";

import type {
  MetaLegendIndexSort,
  MetaLegendIndexSortDirection,
} from "@/features/meta/lib/meta-legends-search";
import {
  DEFAULT_LEGEND_DIRECTION,
  DEFAULT_LEGEND_SORT,
} from "@/features/meta/lib/meta-legends-search";
import type { MetaEra, MetaScope } from "@/features/meta/lib/meta-scope";
import { scopeMatches } from "@/features/meta/lib/meta-scope-match";
import { normalizeCountryCode } from "@/lib/country";

/** `best` and `all` are the same rows in different order; neither is a filtered subset. */
export type MetaFinishesView = "best" | "all";

export const BEST_FINISH_COUNT = 5;

export const FINISH_PAGE_SIZE = 25;

export interface MetaLegendScope {
  scope: MetaScope;
  eras: readonly MetaEra[];
}

/** Limited to the rows on screen: a country scoped away isn't in the payload to offer back. */
export function metaLegendCountries(
  finishes: readonly { event: { country: string | null } }[],
): string[] {
  const codes = new Set<string>();
  for (const event of finishes.map((entry) => entry.event)) {
    const code = normalizeCountryCode(event.country);
    if (code !== null) {
      codes.add(code.toUpperCase());
    }
  }
  return [...codes].sort((left, right) => left.localeCompare(right));
}

/** Adds the scope's already-picked countries to the visible rows, so a selected country stays offered after it's filtered out of view. */
export function metaScopedCountries(
  finishes: readonly { event: { country: string | null } }[],
  scope: MetaScope,
): string[] {
  const codes = new Set(metaLegendCountries(finishes));
  for (const picked of [...(scope.countries ?? []), ...(scope.countriesEx ?? [])]) {
    const code = normalizeCountryCode(picked);
    if (code !== null) {
      codes.add(code.toUpperCase());
    }
  }
  return [...codes].sort((left, right) => left.localeCompare(right));
}

export interface MetaLegendIndexEntry {
  slug: string;
  legend: MetaLegendSummary["legend"];
  bestFinish: {
    rank: number;
    rankIsTier: boolean;
    event: MetaEventSummary;
  };
  finishes: number;
  decklists: number;
  eventWins: number;
}

export interface MetaLegendIndexFilter extends MetaLegendScope {
  search?: string;
}

/**
 * A legend with no finish inside the scope drops out entirely. Every number
 * here is a raw fact; this never computes a rate or a share.
 */
export function metaLegendIndexEntries(
  legends: readonly MetaLegendSummary[],
  events: readonly MetaEventSummary[],
  filter: MetaLegendIndexFilter,
): MetaLegendIndexEntry[] {
  const eventsBySlug = new Map(events.map((event) => [event.slug, event]));
  const needle = filter.search?.trim().toLowerCase() ?? "";

  const entries: MetaLegendIndexEntry[] = [];
  for (const summary of legends) {
    if (needle !== "" && !summary.legend.name.toLowerCase().includes(needle)) {
      continue;
    }

    let best: MetaLegendIndexEntry["bestFinish"] | null = null;
    let finishes = 0;
    let decklists = 0;
    let eventWins = 0;
    for (const record of summary.records) {
      const event = eventsBySlug.get(record.eventSlug);
      if (event === undefined || !scopeMatches(event, filter.scope, filter.eras)) {
        continue;
      }
      finishes += record.finishes;
      decklists += record.decklists;
      if (record.won) {
        eventWins += 1;
      }
      // Assumes records arrive newest event first, so a strict `<` keeps the newest of an equal placing.
      if (best === null || record.bestRank < best.rank) {
        best = { rank: record.bestRank, rankIsTier: record.rankIsTier, event };
      }
    }
    if (best === null) {
      continue;
    }

    entries.push({
      slug: summary.slug,
      legend: summary.legend,
      bestFinish: best,
      finishes,
      decklists,
      eventWins,
    });
  }

  return entries;
}

function compareBestFinish(a: MetaLegendIndexEntry, b: MetaLegendIndexEntry): number {
  return (
    a.bestFinish.rank - b.bestFinish.rank ||
    b.bestFinish.event.eventDate.localeCompare(a.bestFinish.event.eventDate)
  );
}

const LEGEND_SORT_VALUES: Record<
  Exclude<MetaLegendIndexSort, "name">,
  (a: MetaLegendIndexEntry, b: MetaLegendIndexEntry) => number
> = {
  best: compareBestFinish,
  decklists: (a, b) => a.decklists - b.decklists,
  finishes: (a, b) => a.finishes - b.finishes,
};

/** Ties fall back to name for a stable render order. */
export function sortMetaLegendEntries(
  entries: readonly MetaLegendIndexEntry[],
  sort: MetaLegendIndexSort = DEFAULT_LEGEND_SORT,
  direction: MetaLegendIndexSortDirection = DEFAULT_LEGEND_DIRECTION,
): MetaLegendIndexEntry[] {
  const sign = direction === "asc" ? 1 : -1;
  return entries.toSorted((a, b) => {
    const primary =
      sort === "name" ? a.legend.name.localeCompare(b.legend.name) : LEGEND_SORT_VALUES[sort](a, b);
    if (primary !== 0) {
      return primary * sign;
    }
    return a.legend.name.localeCompare(b.legend.name);
  });
}

export function nextLegendSort(
  current: { sort: MetaLegendIndexSort; direction: MetaLegendIndexSortDirection },
  column: MetaLegendIndexSort,
): { sort: MetaLegendIndexSort; direction: MetaLegendIndexSortDirection } {
  if (current.sort === column) {
    return { sort: column, direction: current.direction === "asc" ? "desc" : "asc" };
  }
  return { sort: column, direction: DESCENDING_FIRST.has(column) ? "desc" : "asc" };
}

const DESCENDING_FIRST = new Set<MetaLegendIndexSort>(["decklists", "finishes"]);

export function metaLegendIndexCountries(
  legends: readonly MetaLegendSummary[],
  events: readonly MetaEventSummary[],
): string[] {
  const referenced = new Set<string>();
  for (const summary of legends) {
    for (const record of summary.records) {
      referenced.add(record.eventSlug);
    }
  }
  const codes = new Set<string>();
  for (const event of events) {
    if (referenced.has(event.slug) && event.country !== null && event.country !== "") {
      codes.add(event.country);
    }
  }
  return [...codes].toSorted((left, right) => left.localeCompare(right));
}
