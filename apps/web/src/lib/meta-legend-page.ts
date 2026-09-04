import type { MetaEventSummary, MetaLegendSummary } from "@openrift/shared";

import { normalizeCountryCode } from "@/lib/country";
import type { MetaLegendIndexSort, MetaLegendIndexSortDirection } from "@/lib/meta-legends-search";
import { DEFAULT_LEGEND_DIRECTION, DEFAULT_LEGEND_SORT } from "@/lib/meta-legends-search";
import type { MetaEra, MetaScope } from "@/lib/meta-scope";
import { scopeMatches } from "@/lib/meta-scope-match";

/**
 * Which slice of a legend's record the finishes section is showing.
 *
 * `best` leads with the placings a reader came for; `all` is the whole record in
 * the order it happened. Both are the same rows in a different order, never a
 * filtered subset with a number attached to it.
 */
export type MetaFinishesView = "best" | "all";

export const BEST_FINISH_COUNT = 5;

export const FINISH_PAGE_SIZE = 25;

/** What the legend page's scope bar narrows both of its lists by. */
export interface MetaLegendScope {
  scope: MetaScope;
  /** The eras the scope's era key is resolved against. */
  eras: readonly MetaEra[];
}

/**
 * The country codes the scope bar should offer, from the rows a page holds.
 * Uppercase ISO codes, alphabetical; an event whose venue no source named
 * contributes none.
 *
 * The legend page holds one scoped page of a record, so its list names the
 * countries of the rows on screen and no others: a country the reader has
 * scoped away is not in the payload to offer back.
 */
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

/**
 * The countries the bar offers on a page that holds one scoped page of a
 * record: the rows on screen plus whatever the scope itself names, so the
 * control that picked a country can always pick it back off.
 */
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

/** One legend as the index renders it: identity plus its facts inside the scope. */
export interface MetaLegendIndexEntry {
  slug: string;
  legend: MetaLegendSummary["legend"];
  /** The legend's best placing among the scoped events, ties going to the newest. */
  bestFinish: {
    rank: number;
    rankIsTier: boolean;
    event: MetaEventSummary;
  };
  finishes: number;
  decklists: number;
  /** Events won, not rank-1 rows: a shared first place at one event is one win. */
  eventWins: number;
}

/** What the index narrows its list by. */
export interface MetaLegendIndexFilter extends MetaLegendScope {
  /** Free text matched against the champion-led name. */
  search?: string;
}

/**
 * The rows the index renders: each legend's records joined against the events
 * payload, narrowed to the scope, and folded into the row's facts.
 *
 * A legend with no finish inside the scope drops out entirely, the way an event
 * outside the scope leaves the events index. Every number is a fact about one
 * legend's own record; nothing here computes a rate or a share.
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
      // Records arrive newest event first, so a strict comparison keeps the
      // newest of an equal placing without re-sorting.
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

/** A placing compared as "better first": lower rank, newest of an equal placing ahead. */
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

/**
 * The entries in the reader's chosen order, by name by default. Ties always
 * fall back to the name, so a column of equal values keeps a stable order
 * instead of reshuffling between renders.
 */
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

/**
 * Where a click on a sort header lands. The same column flips direction; a new
 * column starts at the order that reads as "most interesting first" — best
 * placings and biggest counts, but A-Z for names.
 */
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

/**
 * The country codes the index's scope bar should offer: the venues of the
 * events the legends' records actually reference, so the control never offers
 * a country no legend has a result in.
 */
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
