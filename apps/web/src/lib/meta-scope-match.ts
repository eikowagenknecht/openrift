import type { MetaEventTier } from "@openrift/shared";

import { normalizeCountryCode } from "@/lib/country";
import type { MetaEra, MetaScope } from "@/lib/meta-scope";
import { resolveScopeRange } from "@/lib/meta-scope";

/**
 * The event facts the scope bar narrows by. Every archive payload carries them,
 * whether the row arrived as an event, as a legend's finish, or as a deck.
 */
export interface ScopedEvent {
  eventDate: string;
  format: string;
  tier: MetaEventTier;
  country: string | null;
}

/**
 * Whether one event falls inside the scope bar's selection.
 *
 * Lives here rather than beside `metaScopeSearchSchema`: `lib/country` builds an
 * `Intl.DisplayNames` at module scope, and the search schemas are imported by
 * non-lazy route files, which run on every page load.
 */
export function scopeMatches(
  event: ScopedEvent,
  scope: MetaScope,
  eras: readonly MetaEra[],
): boolean {
  if (scope.format !== undefined && event.format !== scope.format) {
    return false;
  }
  if (scope.tier !== undefined && event.tier !== scope.tier) {
    return false;
  }
  const country = normalizeCountryCode(scope.country);
  if (country !== null && normalizeCountryCode(event.country) !== country) {
    return false;
  }
  // Date-only strings sort lexicographically, so plain comparison is enough.
  const range = resolveScopeRange(scope, eras);
  if (range.from !== undefined && event.eventDate < range.from) {
    return false;
  }
  return range.to === undefined || event.eventDate <= range.to;
}
