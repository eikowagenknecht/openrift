import type { MetaDeckSummary } from "@openrift/shared";

import { normalizeCountryCode } from "@/lib/country";
import type { MetaEra, MetaScope } from "@/lib/meta-scope";
import { isScopeCustomized } from "@/lib/meta-scope";
import { scopeMatches } from "@/lib/meta-scope-match";

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
  /** Keeps only the lists the reader can mostly build from their own collection. */
  buildable: boolean;
  /**
   * Opens every archived list instead of the curated one-per-legend-per-event
   * view. Not an axis — it rejects no deck — but the faceted counts read it, so
   * a control's number matches the grid it is counting.
   */
  showAll: boolean;
}

/**
 * What the browser knows about the reader that the archive itself does not. The
 * deck ids arrive already judged, because whether a list is mostly buildable
 * depends on a collection the filter has no business loading.
 */
export interface MetaDeckFilterContext {
  buildableDeckIds?: ReadonlySet<string>;
}

/** The finish buckets offered in the browser, best first. */
export const META_FINISH_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "Winner" },
  { value: 4, label: "Top 4" },
  { value: 8, label: "Top 8" },
  { value: 16, label: "Top 16" },
];

/** One axis of {@link MetaDeckFilterValues}, for the per-axis faceted counts. */
type MetaDeckFilterAxis = "scope" | "events" | "legends" | "finish" | "buildable";

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
  if (axis === "buildable") {
    // Inert until a collection has loaded: a shared `?buildable=true` link would
    // otherwise show a signed-out reader an empty archive, and a signed-in one an
    // empty archive until the bridge answers.
    return (
      !filters.buildable ||
      context.buildableDeckIds === undefined ||
      context.buildableDeckIds.has(deck.deckId)
    );
  }
  return scopeMatches(deck.event, filters.scope, filters.eras);
}

const ALL_AXES: MetaDeckFilterAxis[] = ["scope", "events", "legends", "finish", "buildable"];

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
 * Orders decks for the browser: newest event first, then best finish, then
 * player name so ties on one rank stay stable.
 */
export function sortMetaDecks(decks: readonly MetaDeckSummary[]): MetaDeckSummary[] {
  return decks.toSorted((left, right) => {
    if (left.event.eventDate !== right.event.eventDate) {
      return left.event.eventDate < right.event.eventDate ? 1 : -1;
    }
    if (left.rank !== right.rank) {
      return left.rank - right.rank;
    }
    return left.playerName.localeCompare(right.playerName);
  });
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
    curateMetaDecks(
      decks.filter((deck) =>
        ALL_AXES.every((axis) => axis === skip || passesAxis(deck, filters, context, axis)),
      ),
      filters,
    );

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
    filters.buildable
  );
}
