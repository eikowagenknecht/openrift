import type { MetaDeckSummary, MetaPlayerFinish } from "@openrift/shared";

import { normalizeCountryCode } from "@/lib/country";
import type { MetaFinishesView, MetaLegendScope } from "@/lib/meta-legend-page";
import { metaLegendCountries } from "@/lib/meta-legend-page";
import { scopeMatches } from "@/lib/meta-scope-match";

type MetaPlayerLegend = NonNullable<MetaPlayerFinish["legend"]>;

const TOP_CUT = 8;

export interface MetaPlayerCounts {
  eventWins: number;
  topEights: number;
  finishes: number;
  decklists: number;
}

export function metaPlayerCounts(finishes: readonly MetaPlayerFinish[]): MetaPlayerCounts {
  const wonEvents = new Set(
    finishes.filter((finish) => finish.rank === 1).map((finish) => finish.event.slug),
  );
  const tokens = new Set(
    finishes.map((finish) => finish.shareToken).filter((token) => token !== null),
  );
  return {
    eventWins: wonEvents.size,
    topEights: finishes.filter((finish) => finish.rank <= TOP_CUT).length,
    finishes: finishes.length,
    decklists: tokens.size,
  };
}

export function filterPlayerFinishes(
  finishes: readonly MetaPlayerFinish[],
  filter: MetaLegendScope,
): MetaPlayerFinish[] {
  return finishes.filter((finish) => scopeMatches(finish.event, filter.scope, filter.eras));
}

export function sortPlayerFinishes(
  finishes: readonly MetaPlayerFinish[],
  view: MetaFinishesView,
): MetaPlayerFinish[] {
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

export interface MetaPlayerLegendEntry {
  legend: MetaPlayerLegend;
  finishes: number;
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

/** Grouped by card id, not name: two legend cards can share a champion. */
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

/** The country is where most of the record was played, not a nationality. Ties break to the alphabetically first code. */
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

export function metaPlayerCountries(finishes: readonly MetaPlayerFinish[]): string[] {
  return metaLegendCountries(finishes);
}
