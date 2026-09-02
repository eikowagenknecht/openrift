import type { MetaEventFinish, MetaEventSummary, MetaEventTier } from "@openrift/shared";
import { todayUtc } from "@openrift/shared";

import type { MetaEra, MetaScope } from "@/lib/meta-scope";
import { scopeMatches } from "@/lib/meta-scope-match";

/** What the front page narrows its three lists by. */
export interface MetaFrontFilter {
  scope: MetaScope;
  eras: readonly MetaEra[];
  /** Free text matched against the event's name, organizer and venue. */
  search?: string;
}

function matchesSearch(event: MetaEventSummary, needle: string): boolean {
  const haystack = [event.name, event.organizer, event.location].filter(Boolean).join(" ");
  return haystack.toLowerCase().includes(needle);
}

/**
 * The archived events the scope bar and search box leave standing, newest
 * first. The whole archive already ships as one payload, so every list on the
 * page narrows from the same array rather than issuing its own request — which
 * is also what keeps the counts line and the lists under it describing one
 * scope.
 */
export function filterMetaEvents(
  events: readonly MetaEventSummary[],
  filter: MetaFrontFilter,
): MetaEventSummary[] {
  const needle = filter.search?.trim().toLowerCase() ?? "";

  return events.filter(
    (event) =>
      (needle === "" || matchesSearch(event, needle)) &&
      scopeMatches(event, filter.scope, filter.eras),
  );
}

/**
 * The country codes the scope bar should offer, which is the set these events
 * actually cover. Offering one nothing was played in is a dead option, and no
 * endpoint knows the page's own scope better than the page.
 */
export function metaEventCountries(events: readonly MetaEventSummary[]): string[] {
  const codes = new Set<string>();
  for (const event of events) {
    if (event.country !== null && event.country !== "") {
      codes.add(event.country);
    }
  }
  return [...codes].toSorted((left, right) => left.localeCompare(right));
}

/** The winners of one archived event: its rank-1 finishes, in payload order. */
export function metaEventWinners(event: MetaEventSummary): MetaEventFinish[] {
  return event.topFinishes.filter((finish) => finish.rank === 1);
}

/** The front page's tier buckets, in the order the page renders them. */
export interface MetaFrontSections {
  premier: MetaEventSummary[];
  competitive: MetaEventSummary[];
  /** Store and casual events, which share one section. */
  community: MetaEventSummary[];
  upcoming: MetaEventSummary[];
}

const UPCOMING_TIER_RANK: Record<MetaEventTier, number> = {
  premier: 0,
  competitive: 1,
  store: 2,
  casual: 3,
};

/**
 * The tier buckets keep only events with results on file, newest first. Every
 * future event moves to `upcoming` instead, soonest first.
 */
export function metaFrontSections(
  events: readonly MetaEventSummary[],
  today = todayUtc(),
): MetaFrontSections {
  const played = events
    .filter((event) => event.playerRowCount > 0)
    .toSorted((left, right) => right.eventDate.localeCompare(left.eventDate));
  const upcoming = events
    .filter((event) => event.eventDate > today)
    .toSorted((left, right) => {
      const byDate = left.eventDate.localeCompare(right.eventDate);
      if (byDate !== 0) {
        return byDate;
      }
      const byTier = UPCOMING_TIER_RANK[left.tier] - UPCOMING_TIER_RANK[right.tier];
      return byTier === 0 ? left.name.localeCompare(right.name) : byTier;
    });
  return {
    premier: played.filter((event) => event.tier === "premier"),
    competitive: played.filter((event) => event.tier === "competitive"),
    community: played.filter((event) => event.tier === "store" || event.tier === "casual"),
    upcoming,
  };
}

/** How many events each tier section's "Browse all" link opens on, results or not. */
export function metaTierCounts(
  events: readonly MetaEventSummary[],
): Record<"premier" | "competitive" | "community", number> {
  let premier = 0;
  let competitive = 0;
  let community = 0;
  for (const event of events) {
    if (event.tier === "premier") {
      premier += 1;
    } else if (event.tier === "competitive") {
      competitive += 1;
    } else {
      community += 1;
    }
  }
  return { premier, competitive, community };
}
