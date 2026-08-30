import type { MetaDeckSummary, MetaEventSummary } from "@openrift/shared";

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

/** One archived event that has at least one rank-1 finish to name. */
export interface MetaEventWithWinners extends MetaEventSummary {
  winners: [MetaEventSummary["winners"][number], ...MetaEventSummary["winners"]];
}

/**
 * The most recent events the archive knows a winner for. An event whose
 * standings have not been fetched yet is skipped rather than shown with an
 * empty seat: the section is a gallery of results, and a blank card claims a
 * tournament nobody won.
 *
 * Ordered here rather than trusting the payload, so the section stays "latest"
 * whatever order the caller filtered in. The limit counts events, not names, so
 * a tie at the top of one event does not push another event's win off the row.
 */
export function latestMetaWinners(
  events: readonly MetaEventSummary[],
  limit: number,
): MetaEventWithWinners[] {
  return events
    .filter((event): event is MetaEventWithWinners => event.winners.length > 0)
    .toSorted((left, right) => right.eventDate.localeCompare(left.eventDate))
    .slice(0, limit);
}

/**
 * The archived decks belonging to the events in scope, newest event first and
 * best finish first inside a day. The deck payload carries no tier or country,
 * so scoping it means going through the events that passed the filter.
 */
export function metaDecksForEvents(
  decks: readonly MetaDeckSummary[],
  events: readonly MetaEventSummary[],
  limit: number,
): MetaDeckSummary[] {
  const slugs = new Set(events.map((event) => event.slug));
  return decks
    .filter((deck) => slugs.has(deck.event.slug))
    .toSorted((left, right) => {
      if (left.event.eventDate !== right.event.eventDate) {
        return right.event.eventDate.localeCompare(left.event.eventDate);
      }
      return left.rank - right.rank;
    })
    .slice(0, limit);
}
