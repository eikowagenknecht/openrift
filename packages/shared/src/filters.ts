import {
  includes,
  matchesCustomTags,
  matchesDistributionChannels,
  matchesDomains,
  matchesFlag,
  matchesMarkers,
  matchesRange,
  noneExcluded,
  notExcluded,
  overlaps,
} from "./filters-predicates.js";
import { matchesSearch, parseSearchTerms } from "./filters-search.js";
import type { FilterCardsOptions } from "./filters-shared.js";
import { EMPTY_STRINGS } from "./filters-shared.js";
import { isStandardPrinting } from "./standard.js";
import type { Printing } from "./types/catalog.js";
import type { CardFilters } from "./types/search.js";
import { EMPTY_CARD_FILTERS } from "./types/search.js";
import { WellKnown } from "./well-known.js";

export function filterCards(
  printings: Printing[],
  rawFilters: CardFilters,
  options: FilterCardsOptions = {},
): Printing[] {
  // Persisted list rules re-hydrate via a bare JSON.parse, so an older rule may
  // lack a newer dimension's key; backfill or the first predicate to read it throws.
  const filters: CardFilters = { ...EMPTY_CARD_FILTERS, ...rawFilters };
  const terms = filters.search ? parseSearchTerms(filters.search) : [];
  const hasPrefixes = terms.some((t) => t.field !== null);
  const getPrice = options.getPrice;
  const presence = filters.presence;

  // Per-printing slug projections allocate; decide once whether any active filter
  // reads them (the presence checks below need only lengths, not the arrays).
  const needMarkerSlugs = filters.markerSlugs.length > 0 || filters.markerSlugsExclude.length > 0;
  const needChannelSlugs =
    filters.distributionChannelSlugs.length > 0 ||
    filters.distributionChannelSlugsExclude.length > 0;
  const needCustomTags =
    filters.customTagSlugs.length > 0 ||
    filters.customTagSlugsExclude.length > 0 ||
    presence.customTags !== undefined;

  return printings.filter((printing) => {
    const { card } = printing;
    const artVariant = printing.artVariant || WellKnown.artVariant.NORMAL;
    if (
      !(
        includes(filters.sets, printing.setSlug) &&
        includes(filters.languages, printing.language) &&
        matchesDomains(filters.domains, card.domains) &&
        overlaps(filters.types, card.types) &&
        overlaps(filters.superTypes, card.superTypes) &&
        includes(filters.rarities, printing.rarity) &&
        includes(filters.artVariants, artVariant) &&
        includes(filters.finishes, printing.finish) &&
        includes(filters.cardSizes, printing.size) &&
        notExcluded(filters.setsExclude, printing.setSlug) &&
        notExcluded(filters.languagesExclude, printing.language) &&
        notExcluded(filters.raritiesExclude, printing.rarity) &&
        noneExcluded(filters.typesExclude, card.types) &&
        notExcluded(filters.artVariantsExclude, artVariant) &&
        notExcluded(filters.finishesExclude, printing.finish) &&
        noneExcluded(filters.superTypesExclude, card.superTypes) &&
        noneExcluded(filters.domainsExclude, card.domains) &&
        noneExcluded(filters.keywordsExclude, card.keywords) &&
        noneExcluded(filters.tagsExclude, card.tags) &&
        overlaps(filters.keywords, card.keywords) &&
        overlaps(filters.tags, card.tags) &&
        matchesFlag(filters.isStandard, isStandardPrinting(printing)) &&
        matchesFlag(filters.isSigned, printing.isSigned) &&
        matchesFlag(filters.isOvernumbered, printing.isOvernumbered) &&
        matchesRange(card.energy, filters.energy) &&
        matchesRange(card.might, filters.might) &&
        matchesRange(card.power, filters.power) &&
        matchesRange(getPrice?.(printing) ?? null, filters.price) &&
        matchesFlag(filters.isBanned, card.bans.length > 0) &&
        matchesFlag(filters.hasErrata, card.errata !== null) &&
        matchesFlag(filters.hasNoImage, printing.images.length === 0)
      )
    ) {
      return false;
    }
    if (needMarkerSlugs) {
      const markerSlugs = printing.markers.map((m) => m.slug);
      if (
        !matchesMarkers(filters.markerSlugs, markerSlugs) ||
        !noneExcluded(filters.markerSlugsExclude, markerSlugs)
      ) {
        return false;
      }
    }
    if (needChannelSlugs) {
      const channelSlugs = printing.distributionChannels.map((dc) => dc.channel.slug);
      if (
        !matchesDistributionChannels(filters.distributionChannelSlugs, channelSlugs) ||
        !noneExcluded(filters.distributionChannelSlugsExclude, channelSlugs)
      ) {
        return false;
      }
    }
    if (needCustomTags) {
      const customTagSlugs = options.customTagAssignments?.[printing.cardId] ?? EMPTY_STRINGS;
      if (
        !matchesCustomTags(filters.customTagSlugs, customTagSlugs) ||
        !noneExcluded(filters.customTagSlugsExclude, customTagSlugs)
      ) {
        return false;
      }
      if (presence.customTags && (presence.customTags === "any") !== customTagSlugs.length > 0) {
        return false;
      }
    }
    // Remaining presence checks read only lengths — no slug projections.
    if (presence.markers && (presence.markers === "any") !== printing.markers.length > 0) {
      return false;
    }
    if (
      presence.superTypes &&
      (presence.superTypes === "any") !==
        card.superTypes.some((superType) => superType !== WellKnown.superType.BASIC)
    ) {
      return false;
    }
    if (
      presence.distributionChannels &&
      (presence.distributionChannels === "any") !== printing.distributionChannels.length > 0
    ) {
      return false;
    }
    if (presence.keywords && (presence.keywords === "any") !== card.keywords.length > 0) {
      return false;
    }
    if (presence.tags && (presence.tags === "any") !== card.tags.length > 0) {
      return false;
    }
    return matchesSearch(
      printing,
      terms,
      hasPrefixes,
      filters.searchScope,
      options.keywordReverseMap,
    );
  });
}
