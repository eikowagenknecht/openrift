import type { MetaDeckSummary } from "@openrift/shared/types/api/meta";

import type { MetaDeckCost } from "@/features/meta/lib/meta-deck-collection";
import type { MetaDeckSort, MetaDeckSortDirection } from "@/features/meta/lib/meta-deck-search";
import { DEFAULT_DECK_DIRECTION, DEFAULT_DECK_SORT } from "@/features/meta/lib/meta-deck-search";
import type { MetaEra, MetaScope, ScopeFacetDefaults } from "@/features/meta/lib/meta-scope";
import { isScopeCustomized } from "@/features/meta/lib/meta-scope";
import { scopeMatches } from "@/features/meta/lib/meta-scope-match";
import { normalizeCountryCode } from "@/lib/country";

const DEFAULT_DECK_TIERS: readonly string[] = ["premier", "competitive"];

export const DECK_SCOPE_DEFAULTS: ScopeFacetDefaults = { tiers: DEFAULT_DECK_TIERS };

/**
 * Each axis is a union within itself and an intersection against the others:
 * a deck passes when it matches at least one selected value on every populated axis.
 */
export interface MetaDeckFilterValues {
  scope: MetaScope;
  eras: readonly MetaEra[];
  events: string[];
  legends: string[];
  maxRank: number | null;
  maxCost: number | null;
  valueMin: number | null;
  valueMax: number | null;
  includeSideboard: boolean;
  showAll: boolean;
}

export interface MetaDeckFilterContext {
  costs?: ReadonlyMap<string, MetaDeckCost>;
}

export const META_FINISH_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "Winner" },
  { value: 4, label: "Top 4" },
  { value: 8, label: "Top 8" },
  { value: 16, label: "Top 16" },
];

type MetaDeckFilterAxis = "scope" | "events" | "legends" | "finish" | "cost" | "value";

function passesAxis(
  deck: MetaDeckSummary,
  filters: MetaDeckFilterValues,
  context: MetaDeckFilterContext,
  axis: MetaDeckFilterAxis,
): boolean {
  if (axis === "events") {
    return filters.events.length === 0 || filters.events.includes(deck.event.slug);
  }
  if (axis === "legends") {
    return (
      filters.legends.length === 0 ||
      (deck.legendCardId !== null && filters.legends.includes(deck.legendCardId))
    );
  }
  if (axis === "finish") {
    return filters.maxRank === null || deck.rank <= filters.maxRank;
  }
  if (axis === "cost") {
    // Inert until costs load, so a shared `?cost=` link doesn't open on an
    // empty archive while the bridge answers.
    if (filters.maxCost === null || context.costs === undefined) {
      return true;
    }
    const toComplete = context.costs.get(deck.deckId)?.toComplete;
    return toComplete !== undefined && toComplete <= filters.maxCost;
  }
  if (axis === "value") {
    if ((filters.valueMin === null && filters.valueMax === null) || context.costs === undefined) {
      return true;
    }
    const value = context.costs.get(deck.deckId)?.value;
    if (value === undefined) {
      return false;
    }
    return (
      (filters.valueMin === null || value >= filters.valueMin) &&
      (filters.valueMax === null || value <= filters.valueMax)
    );
  }
  return scopeMatches(deck.event, filters.scope, filters.eras, DECK_SCOPE_DEFAULTS);
}

const ALL_AXES: MetaDeckFilterAxis[] = ["scope", "events", "legends", "finish", "cost", "value"];

export function filterMetaDecks(
  decks: readonly MetaDeckSummary[],
  filters: MetaDeckFilterValues,
  context: MetaDeckFilterContext = {},
): MetaDeckSummary[] {
  return decks.filter((deck) => ALL_AXES.every((axis) => passesAxis(deck, filters, context, axis)));
}

/** A deck with an unknown legend stands alone; it is not merged with other unknown-legend decks at the event. */
function curateBestPerLegend(decks: readonly MetaDeckSummary[]): MetaDeckSummary[] {
  const best = new Map<string, MetaDeckSummary>();
  for (const deck of decks) {
    const key = `${deck.event.slug}|${deck.legendCardId ?? `deck:${deck.deckId}`}`;
    const held = best.get(key);
    if (held === undefined || deck.rank < held.rank) {
      best.set(key, deck);
      continue;
    }
    // Ties break by name for a stable render order.
    if (deck.rank === held.rank && deck.playerName.localeCompare(held.playerName) < 0) {
      best.set(key, deck);
    }
  }
  return [...best.values()];
}

/** Both the grid and the faceted counts go through this, so a count never lies about the grid. */
export function curateMetaDecks(
  decks: readonly MetaDeckSummary[],
  filters: Pick<MetaDeckFilterValues, "showAll">,
): MetaDeckSummary[] {
  return filters.showAll ? [...decks] : curateBestPerLegend(decks);
}

/** A deck whose value or cost is not known yet sorts last whichever way the column runs. */
export function sortMetaDecks(
  decks: readonly MetaDeckSummary[],
  sort: MetaDeckSort = DEFAULT_DECK_SORT,
  direction: MetaDeckSortDirection = DEFAULT_DECK_DIRECTION,
  costs?: ReadonlyMap<string, MetaDeckCost>,
): MetaDeckSummary[] {
  const sign = direction === "asc" ? 1 : -1;
  const priced = (deck: MetaDeckSummary): number | undefined => {
    const cost = costs?.get(deck.deckId);
    return sort === "value" ? cost?.value : cost?.toComplete;
  };
  return decks.toSorted((left, right) => {
    if (sort === "value" || sort === "cost") {
      const leftPrice = priced(left);
      const rightPrice = priced(right);
      if (leftPrice === undefined || rightPrice === undefined) {
        if (leftPrice !== rightPrice) {
          return leftPrice === undefined ? 1 : -1;
        }
      } else if (leftPrice !== rightPrice) {
        return (leftPrice - rightPrice) * sign;
      }
    } else if (sort === "finish" && left.rank !== right.rank) {
      return (left.rank - right.rank) * sign;
    }
    if (left.event.eventDate !== right.event.eventDate) {
      const newestFirst = left.event.eventDate < right.event.eventDate ? 1 : -1;
      return sort === "date" ? newestFirst * -sign : newestFirst;
    }
    if (left.event.slug !== right.event.slug) {
      return left.event.slug < right.event.slug ? -1 : 1;
    }
    if (left.rank !== right.rank) {
      return left.rank - right.rank;
    }
    return left.playerName.localeCompare(right.playerName);
  });
}

export function nextDeckSort(
  current: { sort: MetaDeckSort; direction: MetaDeckSortDirection },
  column: MetaDeckSort,
): { sort: MetaDeckSort; direction: MetaDeckSortDirection } {
  if (current.sort === column) {
    return { sort: column, direction: current.direction === "asc" ? "desc" : "asc" };
  }
  return { sort: column, direction: column === "date" ? "desc" : "asc" };
}

export const META_DECK_SORT_PRESETS: {
  sort: MetaDeckSort;
  direction: MetaDeckSortDirection;
  label: string;
}[] = [
  { sort: "date", direction: "desc", label: "Newest first" },
  { sort: "date", direction: "asc", label: "Oldest first" },
  { sort: "finish", direction: "asc", label: "Best finish" },
  { sort: "cost", direction: "asc", label: "Cheapest to complete" },
  { sort: "value", direction: "asc", label: "Lowest value" },
  { sort: "value", direction: "desc", label: "Highest value" },
];

// Curated after filtering, like the grid, or a count would promise decks the grid folds away.
function shownWithoutAxis(
  decks: readonly MetaDeckSummary[],
  filters: MetaDeckFilterValues,
  context: MetaDeckFilterContext,
  skip: MetaDeckFilterAxis,
): MetaDeckSummary[] {
  return curateMetaDecks(
    decks.filter((deck) =>
      ALL_AXES.every((axis) => axis === skip || passesAxis(deck, filters, context, axis)),
    ),
    filters,
  );
}

export interface MetaDeckFilterCounts {
  events: Map<string, number>;
  legends: Map<string, number>;
  finish: Map<number, number>;
}

function bump<K>(counts: Map<K, number>, key: K): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

/** Counted with every other axis already applied and curated like the grid, or a count would promise decks the grid folds away. */
export function metaDeckFilterCounts(
  decks: readonly MetaDeckSummary[],
  filters: MetaDeckFilterValues,
  context: MetaDeckFilterContext = {},
): MetaDeckFilterCounts {
  const counts: MetaDeckFilterCounts = {
    events: new Map(),
    legends: new Map(),
    finish: new Map(),
  };
  const shownWithout = (skip: MetaDeckFilterAxis) =>
    shownWithoutAxis(decks, filters, context, skip);

  for (const deck of shownWithout("events")) {
    bump(counts.events, deck.event.slug);
  }
  for (const deck of shownWithout("legends")) {
    if (deck.legendCardId !== null) {
      bump(counts.legends, deck.legendCardId);
    }
  }
  for (const deck of shownWithout("finish")) {
    for (const option of META_FINISH_OPTIONS) {
      if (deck.rank <= option.value) {
        bump(counts.finish, option.value);
      }
    }
  }
  return counts;
}

interface MetaDeckFilterOption {
  value: string;
  label: string;
}

export interface MetaDeckFilterOptions {
  events: MetaDeckFilterOption[];
  legends: MetaDeckFilterOption[];
  countries: string[];
}

export function metaDeckFilterOptions(decks: readonly MetaDeckSummary[]): MetaDeckFilterOptions {
  const events = new Map<string, { label: string; date: string }>();
  const legends = new Map<string, string>();
  const countries = new Set<string>();
  for (const deck of decks) {
    events.set(deck.event.slug, { label: deck.event.name, date: deck.event.eventDate });
    if (deck.legendCardId !== null) {
      legends.set(deck.legendCardId, deck.legendName ?? deck.legendCardId);
    }
    const country = normalizeCountryCode(deck.event.country);
    if (country !== null) {
      countries.add(country.toUpperCase());
    }
  }
  return {
    events: [...events]
      .toSorted(([, left], [, right]) => (left.date < right.date ? 1 : -1))
      .map(([value, entry]) => ({ value, label: entry.label })),
    legends: [...legends]
      .map(([value, label]) => ({ value, label }))
      .toSorted((left, right) => left.label.localeCompare(right.label)),
    countries: [...countries].sort((left, right) => left.localeCompare(right)),
  };
}

/** Eras are irrelevant here: an era selection narrows whether the page can resolve it to dates yet. */
export function hasActiveMetaDeckFilters(filters: Omit<MetaDeckFilterValues, "eras">): boolean {
  return (
    isScopeCustomized(filters.scope) ||
    filters.events.length > 0 ||
    filters.legends.length > 0 ||
    filters.maxRank !== null ||
    filters.maxCost !== null ||
    filters.valueMin !== null ||
    filters.valueMax !== null
  );
}

export function countMetaDecksUnderCost(
  decks: readonly MetaDeckSummary[],
  filters: MetaDeckFilterValues,
  context: MetaDeckFilterContext,
  maxCost: number | null,
): number {
  const swapped = { ...filters, maxCost };
  return shownWithoutAxis(decks, swapped, context, "cost").filter((deck) =>
    passesAxis(deck, swapped, context, "cost"),
  ).length;
}
