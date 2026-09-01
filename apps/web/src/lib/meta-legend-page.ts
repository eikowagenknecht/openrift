import type {
  MetaDeckSummary,
  MetaEventSummary,
  MetaLegendFinish,
  MetaLegendSummary,
} from "@openrift/shared";

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

export interface MetaLegendCounts {
  /**
   * Events the legend won, not rank-1 rows: a source that published a shared
   * first place files two rows at one event, and counting rows would report the
   * legend winning it twice.
   */
  eventWins: number;
  finishes: number;
  decklists: number;
}

/**
 * The legend's headline counts.
 *
 * `decklists` counts the decks the grid below actually renders rather than the
 * finishes that claim a list, so the number and the grid can never disagree.
 */
export function metaLegendCounts(
  finishes: readonly MetaLegendFinish[],
  decks: readonly MetaDeckSummary[],
): MetaLegendCounts {
  const wonEvents = new Set(
    finishes.filter((finish) => finish.rank === 1).map((finish) => finish.event.slug),
  );
  return {
    eventWins: wonEvents.size,
    finishes: finishes.length,
    decklists: decks.length,
  };
}

/** What the legend page's scope bar narrows both of its lists by. */
export interface MetaLegendScope {
  scope: MetaScope;
  /** The eras the scope's era key is resolved against. */
  eras: readonly MetaEra[];
}

/** The legend's finishes inside the scope bar's selection. */
export function filterLegendFinishes(
  finishes: readonly MetaLegendFinish[],
  filter: MetaLegendScope,
): MetaLegendFinish[] {
  return finishes.filter((finish) => scopeMatches(finish.event, filter.scope, filter.eras));
}

/**
 * The archived decks filed under one legend, in the payload's own order.
 *
 * Read off the archive's single deck payload rather than fetched per legend: the
 * whole corpus already ships as one cacheable response and the deck browser
 * narrows it the same way (ADR-009, ADR-014).
 */
export function metaLegendDecks(
  decks: readonly MetaDeckSummary[],
  legendCardId: string,
): MetaDeckSummary[] {
  return decks.filter((deck) => deck.legendCardId === legendCardId);
}

/** Those decks inside the scope bar's selection, which is what the grid renders. */
export function filterLegendDecks(
  decks: readonly MetaDeckSummary[],
  filter: MetaLegendScope,
): MetaDeckSummary[] {
  return decks.filter((deck) => scopeMatches(deck.event, filter.scope, filter.eras));
}

/**
 * The country codes the scope bar should offer, which is the set this legend's
 * record covers. Uppercase ISO codes, alphabetical; an event whose venue no
 * source named contributes none.
 *
 * Both lists feed it: a country reachable only through an archived list is still
 * a country the reader can scope to. Read off the whole record rather than the
 * scoped slice, so picking a country never removes the others from the control
 * that picked it.
 */
export function metaLegendCountries(
  finishes: readonly MetaLegendFinish[],
  decks: readonly MetaDeckSummary[],
): string[] {
  const codes = new Set<string>();
  for (const event of [...finishes, ...decks].map((entry) => entry.event)) {
    const code = normalizeCountryCode(event.country);
    if (code !== null) {
      codes.add(code.toUpperCase());
    }
  }
  return [...codes].sort((left, right) => left.localeCompare(right));
}

/**
 * The finishes in the order a view shows them.
 *
 * `best` is the record's high-water marks: best placing first, and the most
 * recent of an equal placing ahead of older ones, so a reader sees what the
 * legend has done lately rather than a five-year-old top 8 pinned to the top.
 * `all` is the record as it happened, newest first, with the better placing
 * first inside one day.
 */
export function sortLegendFinishes(
  finishes: readonly MetaLegendFinish[],
  view: MetaFinishesView,
): MetaLegendFinish[] {
  if (view === "best") {
    return finishes.toSorted(
      (a, b) =>
        a.rank - b.rank ||
        b.event.eventDate.localeCompare(a.event.eventDate) ||
        a.event.name.localeCompare(b.event.name),
    );
  }
  return finishes.toSorted(
    (a, b) =>
      b.event.eventDate.localeCompare(a.event.eventDate) ||
      a.rank - b.rank ||
      a.event.name.localeCompare(b.event.name),
  );
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
