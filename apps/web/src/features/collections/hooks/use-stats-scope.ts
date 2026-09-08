import type { CompletionScopePreference } from "@openrift/shared/types/api/preferences";

import { useFilterValues } from "@/features/cards/hooks/use-card-filters";

// Every section left visible must stay mapped in useScopeFromFilters below,
// or a chip the scope ignores looks live and does nothing.
export const HIDDEN_FILTER_SECTIONS = new Set([
  "owned",
  "superTypes",
  "markers",
  "channels",
  "energy",
  "might",
  "power",
  "price",
]);

export function useScopeFromFilters(): CompletionScopePreference {
  const { filters } = useFilterValues();
  const scope: CompletionScopePreference = {};
  if (filters.sets.length > 0) {
    scope.sets = filters.sets;
  }
  if (filters.languages.length > 0) {
    scope.languages = filters.languages;
  }
  if (filters.domains.length > 0) {
    scope.domains = filters.domains;
  }
  if (filters.types.length > 0) {
    scope.types = filters.types;
  }
  if (filters.rarities.length > 0) {
    scope.rarities = filters.rarities;
  }
  if (filters.finishes.length > 0) {
    scope.finishes = filters.finishes;
  }
  if (filters.artVariants.length > 0) {
    scope.artVariants = filters.artVariants;
  }
  if (filters.keywords.length > 0) {
    scope.keywords = filters.keywords;
  }
  if (filters.tags.length > 0) {
    scope.tags = filters.tags;
  }
  if (filters.customTagSlugs.length > 0) {
    scope.customTags = filters.customTagSlugs;
  }
  if (filters.cardSizes.length > 0) {
    scope.cardSizes = filters.cardSizes;
  }
  if (filters.isStandard !== null) {
    scope.standard = filters.isStandard;
  }
  if (filters.presence.keywords) {
    scope.keywordsPresence = filters.presence.keywords;
  }
  if (filters.presence.tags) {
    scope.tagsPresence = filters.presence.tags;
  }
  if (filters.presence.customTags) {
    scope.customTagsPresence = filters.presence.customTags;
  }
  // Without these an exclude-mode chip changes the URL but leaves every
  // figure on the page untouched.
  if (filters.setsExclude.length > 0) {
    scope.setsExclude = filters.setsExclude;
  }
  if (filters.languagesExclude.length > 0) {
    scope.languagesExclude = filters.languagesExclude;
  }
  if (filters.domainsExclude.length > 0) {
    scope.domainsExclude = filters.domainsExclude;
  }
  if (filters.typesExclude.length > 0) {
    scope.typesExclude = filters.typesExclude;
  }
  if (filters.raritiesExclude.length > 0) {
    scope.raritiesExclude = filters.raritiesExclude;
  }
  if (filters.finishesExclude.length > 0) {
    scope.finishesExclude = filters.finishesExclude;
  }
  if (filters.artVariantsExclude.length > 0) {
    scope.artVariantsExclude = filters.artVariantsExclude;
  }
  if (filters.keywordsExclude.length > 0) {
    scope.keywordsExclude = filters.keywordsExclude;
  }
  if (filters.tagsExclude.length > 0) {
    scope.tagsExclude = filters.tagsExclude;
  }
  if (filters.customTagSlugsExclude.length > 0) {
    scope.customTagsExclude = filters.customTagSlugsExclude;
  }
  if (filters.presence.markers === "any") {
    scope.promos = "only";
  } else if (filters.presence.markers === "none") {
    scope.promos = "exclude";
  }
  if (filters.isSigned !== null) {
    scope.signed = filters.isSigned;
  }
  if (filters.isBanned !== null) {
    scope.banned = filters.isBanned;
  }
  if (filters.hasErrata !== null) {
    scope.errata = filters.hasErrata;
  }
  return scope;
}
