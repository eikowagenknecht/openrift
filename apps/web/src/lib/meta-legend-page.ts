import type { MetaDeckSummary, MetaLegendFinish, MetaLegendSummary } from "@openrift/shared";

import { normalizeCountryCode } from "@/lib/country";
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

/** The legends the index lists, filed under the name a reader sees. */
export function filterLegends(
  legends: readonly MetaLegendSummary[],
  query: string | undefined,
): MetaLegendSummary[] {
  const needle = query?.trim().toLowerCase() ?? "";
  const matched =
    needle === ""
      ? [...legends]
      : legends.filter((entry) => entry.legend.name.toLowerCase().includes(needle));
  return matched.toSorted((a, b) => a.legend.name.localeCompare(b.legend.name));
}
