import type { MetaEventFinish, MetaEventSummary } from "@openrift/shared";

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
}

/**
 * The events in scope split by how much they count for, newest first inside
 * each bucket. Ordered here rather than trusting the payload, so each section
 * stays "recent" whatever order the caller filtered in.
 */
export function metaFrontSections(events: readonly MetaEventSummary[]): MetaFrontSections {
  const sorted = events.toSorted((left, right) => right.eventDate.localeCompare(left.eventDate));
  return {
    premier: sorted.filter((event) => event.tier === "premier"),
    competitive: sorted.filter((event) => event.tier === "competitive"),
    community: sorted.filter((event) => event.tier === "store" || event.tier === "casual"),
  };
}
