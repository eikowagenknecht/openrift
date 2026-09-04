import type { MetaDeckSummary } from "@openrift/shared";

import { normalizeCountryCode } from "@/lib/country";
import type { MetaDeckCost } from "@/lib/meta-deck-collection";
import type { MetaDeckSort, MetaDeckSortDirection } from "@/lib/meta-deck-search";
import { DEFAULT_DECK_DIRECTION, DEFAULT_DECK_SORT } from "@/lib/meta-deck-search";
import type { MetaEra, MetaScope, ScopeFacetDefaults } from "@/lib/meta-scope";
import { isScopeCustomized } from "@/lib/meta-scope";
import { scopeMatches } from "@/lib/meta-scope-match";

/**
 * The tiers the browser opens on. Store nights and casual events outnumber the
 * rest of the archive many times over and mostly hold partial lists, so a reader
 * asking what did well starts with the events that counted.
 */
export const DEFAULT_DECK_TIERS: readonly string[] = ["premier", "competitive"];

export const DECK_SCOPE_DEFAULTS: ScopeFacetDefaults = { tiers: DEFAULT_DECK_TIERS };

/**
 * The meta deck browser's filter state: the archive-wide scope every page
 * carries, plus the axes only a deck list has. Each of those is a union within
 * itself and an intersection against the others, so a deck passes when it
 * matches at least one selected value on every populated axis.
 */
export interface MetaDeckFilterValues {
  scope: MetaScope;
  /** The eras the scope's era key is resolved against. */
  eras: readonly MetaEra[];
  /** Event slugs to keep; empty means every event. */
  events: string[];
  /** Legend card ids to keep; empty means every legend. */
  legends: string[];
  /**
   * The worst finish still shown, as a rank bound: 1 = winners, 4 = top 4, and
   * so on. Null means any finish.
   */
  maxRank: number | null;
  maxCost: number | null;
  valueMin: number | null;
  valueMax: number | null;
  /** Not an axis: the context's costs are computed with it. */
  includeSideboard: boolean;
  /**
   * Opens every archived list instead of the curated one-per-legend-per-event
   * view. Not an axis — it rejects no deck — but the faceted counts read it, so
   * a control's number matches the grid it is counting.
   */
  showAll: boolean;
}

export interface MetaDeckFilterContext {
  costs?: ReadonlyMap<string, MetaDeckCost>;
}

/** The finish buckets offered in the browser, best first. */
export const META_FINISH_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "Winner" },
  { value: 4, label: "Top 4" },
  { value: 8, label: "Top 8" },
  { value: 16, label: "Top 16" },
];

/** One axis of {@link MetaDeckFilterValues}, for the per-axis faceted counts. */
type MetaDeckFilterAxis = "scope" | "events" | "legends" | "finish" | "cost" | "value";

/**
 * Whether one deck passes a single axis. Split out so the faceted counts can
 * ask "would this deck pass everything except axis X?" without duplicating the
 * predicates.
 */
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
    // Inert until the costs have loaded, so a shared `?cost=` link does not open
    // on an empty archive while the bridge answers.
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

/** Narrows the archive to the decks matching every populated axis. */
export function filterMetaDecks(
  decks: readonly MetaDeckSummary[],
  filters: MetaDeckFilterValues,
  context: MetaDeckFilterContext = {},
): MetaDeckSummary[] {
  return decks.filter((deck) => ALL_AXES.every((axis) => passesAxis(deck, filters, context, axis)));
}

/**
 * The best finish each legend reached at each event, which is what the browser
 * opens on: the whole archive lists the same legend once per pilot, and a reader
 * scanning what a tournament produced wants one tile per legend that showed up.
 *
 * The pick is made inside one event, where a finish is a published fact. It
 * never compares legends against each other, and never orders events by how a
 * legend did in them.
 *
 * A deck whose legend the archive does not know stands alone rather than being
 * folded in with every other unknown legend at that event.
 */
function curateBestPerLegend(decks: readonly MetaDeckSummary[]): MetaDeckSummary[] {
  const best = new Map<string, MetaDeckSummary>();
  for (const deck of decks) {
    const key = `${deck.event.slug}|${deck.legendCardId ?? `deck:${deck.deckId}`}`;
    const held = best.get(key);
    if (held === undefined || deck.rank < held.rank) {
      best.set(key, deck);
      continue;
    }
    // Same finish, so the source published no order between them: keep whichever
    // name comes first, so the tile does not change between renders.
    if (deck.rank === held.rank && deck.playerName.localeCompare(held.playerName) < 0) {
      best.set(key, deck);
    }
  }
  return [...best.values()];
}

/**
 * The decks the grid actually renders. Both the grid and the faceted counts go
 * through this, so a control can never advertise a count the grid then folds
 * away.
 */
export function curateMetaDecks(
  decks: readonly MetaDeckSummary[],
  filters: Pick<MetaDeckFilterValues, "showAll">,
): MetaDeckSummary[] {
  return filters.showAll ? [...decks] : curateBestPerLegend(decks);
}

/**
 * Orders decks for the browser. Date keeps one event's lists together, best
 * finish first; the other columns fall back to that order for ties. A deck whose
 * value or cost is not known yet sorts last whichever way the column runs.
 */
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

/**
 * Where a click on a sort header lands: the same column flips, a new column
 * opens on newest, best or cheapest first.
 */
export function nextDeckSort(
  current: { sort: MetaDeckSort; direction: MetaDeckSortDirection },
  column: MetaDeckSort,
): { sort: MetaDeckSort; direction: MetaDeckSortDirection } {
  if (current.sort === column) {
    return { sort: column, direction: current.direction === "asc" ? "desc" : "asc" };
  }
  return { sort: column, direction: column === "date" ? "desc" : "asc" };
}

/** The grid's sort menu: one entry per column, in the order that reads first. */
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

/** Faceted counts per axis, keyed by the axis value the control offers. */
export interface MetaDeckFilterCounts {
  events: Map<string, number>;
  legends: Map<string, number>;
  /** Keyed by the bucket bound (1, 4, 8, 16) rather than a deck's own rank. */
  finish: Map<number, number>;
}

function bump<K>(counts: Map<K, number>, key: K): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

/**
 * How many decks each option would leave, counted with every *other* axis
 * already applied — the same faceting the card browser's filters use, so a
 * value's count reflects the list you would actually get by picking it.
 *
 * Each axis is curated the same way the grid is, because the curation runs after
 * the filtering: counting the raw matches would promise "Kennen (12)" and then
 * render one tile per event.
 */
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

/** A selectable value plus the label the control shows for it. */
interface MetaDeckFilterOption {
  value: string;
  label: string;
}

/** The option lists the browser's controls offer, derived from the archive. */
export interface MetaDeckFilterOptions {
  events: MetaDeckFilterOption[];
  legends: MetaDeckFilterOption[];
  /** Uppercase ISO codes the archive's events were held in, alphabetical. */
  countries: string[];
}

/**
 * The distinct values present in the archive, so a control never offers a legend
 * or a country nothing was played in. Events come out newest first (the order the
 * browser groups them in); legends alphabetically.
 */
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

/**
 * Whether anything narrows the archive. The eras are irrelevant here: an era
 * selection narrows whether or not the page can resolve it to dates yet.
 */
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
