import type { DeckFormatConfig } from "@openrift/shared/types/api/deck";
import type { DeckFormat, DeckZone } from "@openrift/shared/types/enums";
import { WellKnown } from "@openrift/shared/well-known";

import type { DeckBuilderCard } from "@/features/decks/lib/deck-builder-card";

export interface DeckZoneFilterPreset {
  arrayFilters: {
    types: string[];
    superTypes: string[];
    superTypesEx: string[];
    domains: string[];
    customTags: string[];
  };
  clearStatRanges: boolean;
  search: string;
}

export function deckZoneFilterPreset(
  zone: DeckZone,
  cards: readonly DeckBuilderCard[],
  format: DeckFormat,
  formatConfig: DeckFormatConfig | null,
): DeckZoneFilterPreset {
  const legend = cards.find((card) => card.zone === WellKnown.deckZone.LEGEND);
  const legendDomains: string[] = legend?.domains ?? [];
  const domainsWithColorless =
    legendDomains.length > 0 ? [...legendDomains, WellKnown.domain.COLORLESS] : [];
  // Tag-locked formats re-apply their tag selection on every zone change,
  // resetting any chips the user un-toggled within the previous zone.
  const formatTagSlugs = Array.isArray(formatConfig?.tagSlugs) ? formatConfig.tagSlugs : [];
  // Custom-Region drops both domain-match rules, so any-color cards are
  // legal across every zone; skip the legend-domain prefilter.
  const isCustomRegion = format === WellKnown.deckFormat.CUSTOM_REGION;
  const runesDomainFilter = isCustomRegion ? [] : legendDomains;
  const mainDomainFilter = isCustomRegion ? [] : domainsWithColorless;

  // Every token is colorless today, so excluding tokens keeps them from
  // leaking into the main/sideboard browser through the colorless bucket.
  const excludeTokens = [WellKnown.superType.TOKEN];

  switch (zone) {
    case WellKnown.deckZone.LEGEND: {
      return {
        arrayFilters: {
          types: [WellKnown.cardType.LEGEND],
          superTypes: [],
          superTypesEx: excludeTokens,
          domains: [],
          customTags: formatTagSlugs,
        },
        // Legends, runes and battlefields have no energy / might / power, so a
        // carried-over range filter would hide every card in these zones.
        clearStatRanges: true,
        search: "",
      };
    }
    case WellKnown.deckZone.CHAMPION: {
      const legendTag = legend?.tags[0];
      return {
        arrayFilters: {
          types: [WellKnown.cardType.UNIT],
          superTypes: [WellKnown.superType.CHAMPION],
          superTypesEx: excludeTokens,
          domains: mainDomainFilter,
          customTags: formatTagSlugs,
        },
        clearStatRanges: false,
        search: legendTag ? `t:${legendTag}` : "",
      };
    }
    case WellKnown.deckZone.RUNES: {
      return {
        arrayFilters: {
          types: [WellKnown.cardType.RUNE],
          superTypes: [],
          superTypesEx: excludeTokens,
          domains: runesDomainFilter,
          customTags: formatTagSlugs,
        },
        clearStatRanges: true,
        search: "",
      };
    }
    case WellKnown.deckZone.BATTLEFIELD: {
      return {
        arrayFilters: {
          types: [WellKnown.cardType.BATTLEFIELD],
          superTypes: [],
          superTypesEx: excludeTokens,
          domains: [],
          customTags: formatTagSlugs,
        },
        clearStatRanges: true,
        search: "",
      };
    }
    case WellKnown.deckZone.MAIN:
    case WellKnown.deckZone.SIDEBOARD: {
      return {
        arrayFilters: {
          types: [WellKnown.cardType.UNIT, "spell", WellKnown.cardType.GEAR],
          superTypes: [],
          superTypesEx: excludeTokens,
          domains: mainDomainFilter,
          customTags: formatTagSlugs,
        },
        clearStatRanges: false,
        search: "",
      };
    }
    case WellKnown.deckZone.OVERFLOW: {
      return {
        arrayFilters: {
          types: [
            WellKnown.cardType.UNIT,
            "spell",
            WellKnown.cardType.GEAR,
            WellKnown.cardType.BATTLEFIELD,
          ],
          superTypes: [],
          superTypesEx: excludeTokens,
          domains: mainDomainFilter,
          customTags: formatTagSlugs,
        },
        clearStatRanges: false,
        search: "",
      };
    }
  }
}
