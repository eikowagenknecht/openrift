import type { CompletionScopePreference } from "@openrift/shared";

import type { CompletionCountMode, CompletionGroupBy } from "@/hooks/use-collection-stats";
import type { FilterSearch } from "@/lib/search-schemas";

/**
 * Builds the typed search payload for a "View missing" link on the collection
 * stats page. The /cards route's validateSearch expects arrays / booleans (not
 * comma-separated or stringified URL params), and the "missing" set is every
 * bucket short of fully owned.
 *
 * @returns A partial /cards search object, or `undefined` when the link should
 *   not be rendered (count modes other than "cards" filter at the printing
 *   level, which the card browser cannot express).
 */
export function buildMissingSearch({
  countMode,
  groupBy,
  key,
  scope,
  setIdToSlug,
}: {
  countMode: CompletionCountMode;
  groupBy: CompletionGroupBy;
  key: string;
  scope: CompletionScopePreference;
  setIdToSlug: ReadonlyMap<string, string>;
}): Partial<FilterSearch> | undefined {
  if (countMode !== "cards") {
    return undefined;
  }
  const search: Partial<FilterSearch> = {
    owned: ["none", "partial"],
  };
  if (scope.sets && scope.sets.length > 0) {
    search.sets = scope.sets;
  }
  if (scope.languages && scope.languages.length > 0) {
    search.languages = scope.languages;
  }
  if (scope.domains && scope.domains.length > 0) {
    search.domains = scope.domains;
  }
  if (scope.types && scope.types.length > 0) {
    search.types = scope.types;
  }
  if (scope.rarities && scope.rarities.length > 0) {
    search.rarities = scope.rarities;
  }
  if (scope.finishes && scope.finishes.length > 0) {
    search.finishes = scope.finishes;
  }
  if (scope.artVariants && scope.artVariants.length > 0) {
    search.artVariants = scope.artVariants;
  }
  if (scope.promos === "only") {
    search.promo = true;
  } else if (scope.promos === "exclude") {
    search.promo = false;
  }
  if (scope.signed !== undefined) {
    search.signed = scope.signed;
  }
  if (scope.banned !== undefined) {
    search.banned = scope.banned;
  }
  if (scope.errata !== undefined) {
    search.errata = scope.errata;
  }
  switch (groupBy) {
    case "set": {
      const slug = setIdToSlug.get(key);
      if (slug) {
        search.sets = [slug];
      }
      break;
    }
    case "domain": {
      search.domains = [key];
      break;
    }
    case "rarity": {
      search.rarities = [key];
      break;
    }
    case "type": {
      search.types = [key];
      break;
    }
  }
  return search;
}
