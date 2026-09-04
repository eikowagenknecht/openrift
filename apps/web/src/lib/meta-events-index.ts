import type { MetaEventSummary, MetaEventTier } from "@openrift/shared";
import { todayUtc } from "@openrift/shared";

import { normalizeCountryCode } from "@/lib/country";
import type {
  MetaEventHoldings,
  MetaEventIndexSort,
  MetaEventIndexSortDirection,
} from "@/lib/meta-events-search";
import { DEFAULT_EVENT_DIRECTION, DEFAULT_EVENT_SORT } from "@/lib/meta-events-search";
import type { MetaEra, MetaScope } from "@/lib/meta-scope";
import { scopeMatches } from "@/lib/meta-scope-match";

/**
 * Premier first, local last. Ascending puts the events that count for most at
 * the top, which is the order a reader means by "sort by tier".
 */
const TIER_RANK: Record<MetaEventTier, number> = {
  premier: 0,
  competitive: 1,
  local: 2,
};

/**
 * The countries the index can offer, which is the set its own payload covers.
 * Uppercase ISO codes, alphabetical; an event with no country contributes none.
 */
export function metaEventCountries(events: readonly MetaEventSummary[]): string[] {
  const codes = new Set<string>();
  for (const event of events) {
    const code = normalizeCountryCode(event.country);
    if (code !== null) {
      codes.add(code.toUpperCase());
    }
  }
  return [...codes].sort((left, right) => left.localeCompare(right));
}

/**
 * The events left after the search box, the scope bar and the holdings filter.
 *
 * The whole archive ships as one payload (ADR-014), so all three narrow
 * client-side and the count under the title is always the truth about what is on
 * screen.
 */
export function filterMetaEvents(
  events: readonly MetaEventSummary[],
  filter: {
    query?: string;
    scope: MetaScope;
    eras: readonly MetaEra[];
    holds?: MetaEventHoldings;
    today?: string;
  },
): MetaEventSummary[] {
  const needle = (filter.query ?? "").trim().toLowerCase();
  const today = filter.today ?? todayUtc();

  return events.filter(
    (event) =>
      (needle === "" || matchesText(event, needle)) &&
      holdsEnough(event, filter.holds, today) &&
      scopeMatches(event, filter.scope, filter.eras),
  );
}

function holdsEnough(
  event: MetaEventSummary,
  holds: MetaEventHoldings | undefined,
  today: string,
): boolean {
  if (holds === "decks") {
    return event.deckCount > 0;
  }
  if (holds === "standings") {
    return event.playerRowCount > 0;
  }
  if (holds === "upcoming") {
    return event.eventDate > today;
  }
  return true;
}

function matchesText(event: MetaEventSummary, needle: string): boolean {
  return [event.name, event.organizer, event.location].some(
    (field) => field !== null && field.toLowerCase().includes(needle),
  );
}

/**
 * The events in the reader's chosen order, newest first by default.
 *
 * Ties always fall back to the event name, so a column of equal values keeps a
 * stable order instead of reshuffling between renders. A country nobody
 * recorded sorts last whichever way the column runs: an event with no country
 * is not the answer to "which country comes first", in either direction.
 */
export function sortMetaEvents(
  events: readonly MetaEventSummary[],
  sort: MetaEventIndexSort = DEFAULT_EVENT_SORT,
  direction: MetaEventIndexSortDirection = DEFAULT_EVENT_DIRECTION,
): MetaEventSummary[] {
  const sign = direction === "asc" ? 1 : -1;
  return events.toSorted((left, right) => {
    const missing = compareMissing(sort, left, right);
    if (missing !== 0) {
      return missing;
    }
    const primary = compareValues(sort, left, right);
    if (primary !== 0) {
      return primary * sign;
    }
    return left.name.localeCompare(right.name);
  });
}

/** Sorted outside the direction, so an unrecorded country stays at the bottom either way. */
function compareMissing(
  sort: MetaEventIndexSort,
  left: MetaEventSummary,
  right: MetaEventSummary,
): number {
  if (sort !== "country") {
    return 0;
  }
  const leftHas = normalizeCountryCode(left.country) !== null;
  const rightHas = normalizeCountryCode(right.country) !== null;
  if (leftHas === rightHas) {
    return 0;
  }
  return leftHas ? -1 : 1;
}

function compareValues(
  sort: MetaEventIndexSort,
  left: MetaEventSummary,
  right: MetaEventSummary,
): number {
  switch (sort) {
    case "name": {
      return left.name.localeCompare(right.name);
    }
    case "tier": {
      return TIER_RANK[left.tier] - TIER_RANK[right.tier];
    }
    case "country": {
      return (normalizeCountryCode(left.country) ?? "").localeCompare(
        normalizeCountryCode(right.country) ?? "",
      );
    }
    case "players": {
      return left.playerRowCount - right.playerRowCount;
    }
    case "decks": {
      return left.deckCount - right.deckCount;
    }
    default: {
      return left.eventDate.localeCompare(right.eventDate);
    }
  }
}

/**
 * Where a click on a sort header lands. The same column flips direction; a new
 * column starts at the order that reads as "most interesting first" — newest
 * dates and biggest fields, but A-Z for names and premier-first for tiers.
 */
export function nextEventSort(
  current: { sort: MetaEventIndexSort; direction: MetaEventIndexSortDirection },
  column: MetaEventIndexSort,
): { sort: MetaEventIndexSort; direction: MetaEventIndexSortDirection } {
  if (current.sort === column) {
    return { sort: column, direction: current.direction === "asc" ? "desc" : "asc" };
  }
  return { sort: column, direction: DESCENDING_FIRST.has(column) ? "desc" : "asc" };
}

const DESCENDING_FIRST = new Set<MetaEventIndexSort>(["date", "players", "decks"]);
