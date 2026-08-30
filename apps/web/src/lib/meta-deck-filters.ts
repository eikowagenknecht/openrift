import type { MetaDeckSummary } from "@openrift/shared";

/**
 * The meta deck browser's filter state. Every axis is a union within itself and
 * an intersection against the others: a deck passes when it matches at least
 * one selected value on each populated axis.
 */
export interface MetaDeckFilterValues {
  /** Deck-format slugs to keep; empty means every format. */
  formats: string[];
  /** Event slugs to keep; empty means every event. */
  events: string[];
  /** Legend card ids to keep; empty means every legend. */
  legends: string[];
  /**
   * The worst finish still shown, as a rank bound: 1 = winners, 4 = top 4, and
   * so on. Null means any finish.
   */
  maxRank: number | null;
  /** Inclusive event-date bounds as ISO date-only strings, or null for open. */
  dateFrom: string | null;
  dateTo: string | null;
}

/** The finish buckets offered in the browser, best first. */
export const META_FINISH_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "Winner" },
  { value: 4, label: "Top 4" },
  { value: 8, label: "Top 8" },
  { value: 16, label: "Top 16" },
];

/** One axis of {@link MetaDeckFilterValues}, for the per-axis faceted counts. */
type MetaDeckFilterAxis = "formats" | "events" | "legends" | "finish" | "dates";

/**
 * Whether one deck passes a single axis. Split out so the faceted counts can
 * ask "would this deck pass everything except axis X?" without duplicating the
 * predicates.
 * @returns True when the deck satisfies that axis.
 */
function passesAxis(
  deck: MetaDeckSummary,
  filters: MetaDeckFilterValues,
  axis: MetaDeckFilterAxis,
): boolean {
  if (axis === "formats") {
    return filters.formats.length === 0 || filters.formats.includes(deck.event.format);
  }
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
  // Date-only strings sort lexicographically, so plain comparison is enough.
  if (filters.dateFrom !== null && deck.event.eventDate < filters.dateFrom) {
    return false;
  }
  return filters.dateTo === null || deck.event.eventDate <= filters.dateTo;
}

const ALL_AXES: MetaDeckFilterAxis[] = ["formats", "events", "legends", "finish", "dates"];

/**
 * Narrows the archive to the decks matching every populated axis.
 * @returns The matching decks, in the input's order.
 */
export function filterMetaDecks(
  decks: MetaDeckSummary[],
  filters: MetaDeckFilterValues,
): MetaDeckSummary[] {
  return decks.filter((deck) => ALL_AXES.every((axis) => passesAxis(deck, filters, axis)));
}

/**
 * Orders decks for the browser: newest event first, then best finish, then
 * player name so ties on one rank stay stable.
 * @returns A new sorted array.
 */
export function sortMetaDecks(decks: MetaDeckSummary[]): MetaDeckSummary[] {
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
  formats: Map<string, number>;
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
 * @returns The per-axis count maps.
 */
export function metaDeckFilterCounts(
  decks: MetaDeckSummary[],
  filters: MetaDeckFilterValues,
): MetaDeckFilterCounts {
  const counts: MetaDeckFilterCounts = {
    formats: new Map(),
    events: new Map(),
    legends: new Map(),
    finish: new Map(),
  };
  for (const deck of decks) {
    const others = (skip: MetaDeckFilterAxis) =>
      ALL_AXES.every((axis) => axis === skip || passesAxis(deck, filters, axis));
    if (others("formats")) {
      bump(counts.formats, deck.event.format);
    }
    if (others("events")) {
      bump(counts.events, deck.event.slug);
    }
    if (others("legends") && deck.legendCardId !== null) {
      bump(counts.legends, deck.legendCardId);
    }
    if (others("finish")) {
      for (const option of META_FINISH_OPTIONS) {
        if (deck.rank <= option.value) {
          bump(counts.finish, option.value);
        }
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
  formats: string[];
  events: MetaDeckFilterOption[];
  legends: MetaDeckFilterOption[];
}

/**
 * The distinct values present in the archive, so a control never offers a
 * format or legend nothing was played in. Events come out newest first (the
 * order the browser groups them in); legends alphabetically.
 * @returns The option lists for the format, event and legend controls.
 */
export function metaDeckFilterOptions(decks: MetaDeckSummary[]): MetaDeckFilterOptions {
  const formats = new Set<string>();
  const events = new Map<string, { label: string; date: string }>();
  const legends = new Map<string, string>();
  for (const deck of decks) {
    formats.add(deck.event.format);
    events.set(deck.event.slug, { label: deck.event.name, date: deck.event.eventDate });
    if (deck.legendCardId !== null) {
      legends.set(deck.legendCardId, deck.legendName ?? deck.legendCardId);
    }
  }
  return {
    formats: [...formats].sort((left, right) => left.localeCompare(right)),
    events: [...events]
      .toSorted(([, left], [, right]) => (left.date < right.date ? 1 : -1))
      .map(([value, entry]) => ({ value, label: entry.label })),
    legends: [...legends]
      .map(([value, label]) => ({ value, label }))
      .toSorted((left, right) => left.label.localeCompare(right.label)),
  };
}

/**
 * Whether anything narrows the archive.
 * @returns True when at least one axis is populated.
 */
export function hasActiveMetaDeckFilters(filters: MetaDeckFilterValues): boolean {
  return (
    filters.formats.length > 0 ||
    filters.events.length > 0 ||
    filters.legends.length > 0 ||
    filters.maxRank !== null ||
    filters.dateFrom !== null ||
    filters.dateTo !== null
  );
}
