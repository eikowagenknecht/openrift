import type { MetaEventTier } from "@openrift/shared";

import { normalizeCountryCode } from "@/lib/country";
import type { MetaEra, MetaScope, ScopeFacetDefaults } from "@/lib/meta-scope";
import { resolveScopeRange, scopeFacetValues } from "@/lib/meta-scope";

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
 * Whether one value sits inside a facet's selection.
 *
 * An axis carries includes or excludes, never both (ADR-034). An event the
 * source told us nothing about is outside every include set — an unknown country
 * is not Germany — but inside every exclude set, since "all but Germany" is a
 * claim about Germany and not about the events with no country on file.
 */
function axisMatches(
  value: string | null,
  included: readonly string[],
  excluded: readonly string[],
): boolean {
  if (included.length > 0) {
    return value !== null && included.includes(value);
  }
  if (excluded.length > 0) {
    return value === null || !excluded.includes(value);
  }
  return true;
}

function countryCodes(values: readonly string[]): string[] {
  return values
    .map((value) => normalizeCountryCode(value))
    .filter((code): code is string => code !== null);
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
  defaults: ScopeFacetDefaults = {},
): boolean {
  const format = scopeFacetValues(scope, "formats", defaults);
  if (!axisMatches(event.format, format.included, format.excluded)) {
    return false;
  }
  const tier = scopeFacetValues(scope, "tiers", defaults);
  if (!axisMatches(event.tier, tier.included, tier.excluded)) {
    return false;
  }
  const country = scopeFacetValues(scope, "countries", defaults);
  if (
    !axisMatches(
      normalizeCountryCode(event.country),
      countryCodes(country.included),
      countryCodes(country.excluded),
    )
  ) {
    return false;
  }
  // Date-only strings sort lexicographically, so plain comparison is enough.
  const range = resolveScopeRange(scope, eras);
  if (range.from !== undefined && event.eventDate < range.from) {
    return false;
  }
  return range.to === undefined || event.eventDate <= range.to;
}
