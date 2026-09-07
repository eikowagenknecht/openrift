import type { MetaEventFinish, MetaEventSummary, MetaEventTier } from "@openrift/shared";
import { todayUtc } from "@openrift/shared";

import type { MetaEra, MetaScope } from "@/lib/meta-scope";
import { scopeMatches } from "@/lib/meta-scope-match";

export interface MetaFrontFilter {
  scope: MetaScope;
  eras: readonly MetaEra[];
  search?: string;
}

function matchesSearch(event: MetaEventSummary, needle: string): boolean {
  const haystack = [event.name, event.organizer, event.location].filter(Boolean).join(" ");
  return haystack.toLowerCase().includes(needle);
}

/** Every list on the page narrows from this same array; separate requests would let the counts and the lists describe different scopes. */
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

export function metaEventCountries(events: readonly MetaEventSummary[]): string[] {
  const codes = new Set<string>();
  for (const event of events) {
    if (event.country !== null && event.country !== "") {
      codes.add(event.country);
    }
  }
  return [...codes].toSorted((left, right) => left.localeCompare(right));
}

export function metaEventWinners(event: MetaEventSummary): MetaEventFinish[] {
  return event.topFinishes.filter((finish) => finish.rank === 1);
}

export interface MetaFrontSections {
  premier: MetaEventSummary[];
  competitive: MetaEventSummary[];
  local: MetaEventSummary[];
  upcoming: MetaEventSummary[];
}

const UPCOMING_TIER_RANK: Record<MetaEventTier, number> = {
  premier: 0,
  competitive: 1,
  local: 2,
};

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
    local: played.filter((event) => event.tier === "local"),
    upcoming,
  };
}
