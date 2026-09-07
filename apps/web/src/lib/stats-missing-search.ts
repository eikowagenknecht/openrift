import type { CompletionScopePreference } from "@openrift/shared";

import type { CompletionCountMode, CompletionGroupBy } from "@/hooks/use-collection-stats";
import type { FilterSearch } from "@/lib/search-schemas";

/**
 * Builds the typed /cards search payload for a "View missing" link. Returns
 * undefined for count modes below the card level, which /cards can't express.
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
  if (scope.keywords && scope.keywords.length > 0) {
    search.keywords = scope.keywords;
  }
  if (scope.tags && scope.tags.length > 0) {
    search.tags = scope.tags;
  }
  if (scope.customTags && scope.customTags.length > 0) {
    search.customTags = scope.customTags;
  }
  if (scope.cardSizes && scope.cardSizes.length > 0) {
    search.cardSizes = scope.cardSizes;
  }
  if (scope.standard !== undefined) {
    search.standard = scope.standard;
  }
  if (scope.keywordsPresence) {
    search.keywordsPresence = scope.keywordsPresence;
  }
  if (scope.tagsPresence) {
    search.tagsPresence = scope.tagsPresence;
  }
  if (scope.customTagsPresence) {
    search.customTagsPresence = scope.customTagsPresence;
  }
  if (scope.keywordsExclude && scope.keywordsExclude.length > 0) {
    search.keywordsEx = scope.keywordsExclude;
  }
  if (scope.tagsExclude && scope.tagsExclude.length > 0) {
    search.tagsEx = scope.tagsExclude;
  }
  if (scope.customTagsExclude && scope.customTagsExclude.length > 0) {
    search.customTagsEx = scope.customTagsExclude;
  }
  if (scope.setsExclude && scope.setsExclude.length > 0) {
    search.setsEx = scope.setsExclude;
  }
  if (scope.languagesExclude && scope.languagesExclude.length > 0) {
    search.languagesEx = scope.languagesExclude;
  }
  if (scope.domainsExclude && scope.domainsExclude.length > 0) {
    search.domainsEx = scope.domainsExclude;
  }
  if (scope.typesExclude && scope.typesExclude.length > 0) {
    search.typesEx = scope.typesExclude;
  }
  if (scope.raritiesExclude && scope.raritiesExclude.length > 0) {
    search.raritiesEx = scope.raritiesExclude;
  }
  if (scope.finishesExclude && scope.finishesExclude.length > 0) {
    search.finishesEx = scope.finishesExclude;
  }
  if (scope.artVariantsExclude && scope.artVariantsExclude.length > 0) {
    search.artVariantsEx = scope.artVariantsExclude;
  }
  if (scope.promos === "only") {
    search.markersPresence = "any";
  } else if (scope.promos === "exclude") {
    search.markersPresence = "none";
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
