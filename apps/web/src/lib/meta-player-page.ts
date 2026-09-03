import type { MetaDeckSummary, MetaPlayerFinish } from "@openrift/shared";

import { normalizeCountryCode } from "@/lib/country";
import type { MetaFinishesView, MetaLegendScope } from "@/lib/meta-legend-page";
import {
  filterLegendFinishes,
  metaLegendCountries,
  sortLegendFinishes,
} from "@/lib/meta-legend-page";

type MetaPlayerLegend = NonNullable<MetaPlayerFinish["legend"]>;

const TOP_CUT = 8;

export interface MetaPlayerCounts {
  /**
   * Events won, not rank-1 rows: a shared first place files two rows at one
   * event, and counting rows would report the player winning it twice.
   */
  eventWins: number;
  topEights: number;
  finishes: number;
  decklists: number;
}

/**
 * `decklists` counts the decks the grid renders rather than the finishes that
 * claim a list, so the number and the grid can never disagree.
 */
export function metaPlayerCounts(
  finishes: readonly MetaPlayerFinish[],
  decks: readonly MetaDeckSummary[],
): MetaPlayerCounts {
  const wonEvents = new Set(
    finishes.filter((finish) => finish.rank === 1).map((finish) => finish.event.slug),
  );
  return {
    eventWins: wonEvents.size,
    topEights: finishes.filter((finish) => finish.rank <= TOP_CUT).length,
    finishes: finishes.length,
    decklists: decks.length,
  };
}

export function filterPlayerFinishes(
  finishes: readonly MetaPlayerFinish[],
  filter: MetaLegendScope,
): MetaPlayerFinish[] {
  return filterLegendFinishes(finishes, filter);
}

export function sortPlayerFinishes(
  finishes: readonly MetaPlayerFinish[],
  view: MetaFinishesView,
): MetaPlayerFinish[] {
  return sortLegendFinishes(finishes, view);
}

export interface MetaPlayerLegendEntry {
  legend: MetaPlayerLegend;
  finishes: number;
  /** Events won with it, not rank-1 rows. */
  wins: number;
  bestRank: number;
}

export interface MetaPlayerLegendsResult {
  entries: MetaPlayerLegendEntry[];
  withoutLegend: number;
}

interface LegendTally {
  legend: MetaPlayerLegend;
  finishes: number;
  wonEvents: Set<string>;
  bestRank: number;
}

/**
 * Grouped by card id, not name: two legend cards can share a champion. Ties
 * fall to the better placing, then the name, so equal counts keep a stable order.
 */
export function metaPlayerLegends(finishes: readonly MetaPlayerFinish[]): MetaPlayerLegendsResult {
  const tallies = new Map<string, LegendTally>();
  let withoutLegend = 0;

  for (const finish of finishes) {
    const { legend } = finish;
    if (legend === null) {
      withoutLegend += 1;
      continue;
    }
    const tally = tallies.get(legend.cardId);
    if (tally === undefined) {
      tallies.set(legend.cardId, {
        legend,
        finishes: 1,
        wonEvents: new Set(finish.rank === 1 ? [finish.event.slug] : []),
        bestRank: finish.rank,
      });
      continue;
    }
    tally.finishes += 1;
    tally.bestRank = Math.min(tally.bestRank, finish.rank);
    if (finish.rank === 1) {
      tally.wonEvents.add(finish.event.slug);
    }
  }

  const entries = [...tallies.values()]
    .map((tally) => ({
      legend: tally.legend,
      finishes: tally.finishes,
      wins: tally.wonEvents.size,
      bestRank: tally.bestRank,
    }))
    .toSorted(
      (a, b) =>
        b.finishes - a.finishes ||
        a.bestRank - b.bestRank ||
        a.legend.name.localeCompare(b.legend.name),
    );

  return { entries, withoutLegend };
}

export function metaPlayerDecks(
  decks: readonly MetaDeckSummary[],
  finishes: readonly MetaPlayerFinish[],
): MetaDeckSummary[] {
  const tokens = new Set(
    finishes.map((finish) => finish.shareToken).filter((token): token is string => token !== null),
  );
  return decks.filter((deck) => tokens.has(deck.shareToken));
}

export interface MetaPlayerFacts {
  country: string | null;
  firstDate: string | null;
  lastDate: string | null;
  topLegend: MetaPlayerLegend | null;
}

/**
 * The country is where most of the record was played, not a nationality. A tie
 * falls to the alphabetically first code so the line does not flip between renders.
 */
export function metaPlayerFacts(finishes: readonly MetaPlayerFinish[]): MetaPlayerFacts {
  const byCountry = new Map<string, number>();
  let firstDate: string | null = null;
  let lastDate: string | null = null;

  for (const finish of finishes) {
    const code = normalizeCountryCode(finish.event.country)?.toUpperCase() ?? null;
    if (code !== null) {
      byCountry.set(code, (byCountry.get(code) ?? 0) + 1);
    }
    const { eventDate } = finish.event;
    if (firstDate === null || eventDate < firstDate) {
      firstDate = eventDate;
    }
    if (lastDate === null || eventDate > lastDate) {
      lastDate = eventDate;
    }
  }

  const country =
    [...byCountry.entries()].toSorted((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ??
    null;

  return {
    country,
    firstDate,
    lastDate,
    topLegend: metaPlayerLegends(finishes).entries[0]?.legend ?? null,
  };
}

/**
 * Read off the whole record rather than the scoped slice, so picking a country
 * never removes the others from the control that picked it.
 */
export function metaPlayerCountries(
  finishes: readonly MetaPlayerFinish[],
  decks: readonly MetaDeckSummary[],
): string[] {
  return metaLegendCountries(finishes, decks);
}
