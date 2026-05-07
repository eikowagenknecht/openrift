import type {
  DistributionChannelWithCount,
  Marketplace,
  PriceLookup,
  Printing,
} from "@openrift/shared";

import type { ChannelNode } from "./promos-tree";
import { buildPromoTree } from "./promos-tree";

export type PromoSortField = "canonical" | "name" | "code" | "recent" | "priceAsc" | "priceDesc";

const PRICE_SORT_FALLBACK = Number.POSITIVE_INFINITY;

/**
 * Group already-filtered printings under each channel they link to, then build
 * a fresh channel tree from those groupings. Pure transform — does not apply
 * filters itself; the caller is expected to pass filterCards-narrowed input.
 * @returns The channel tree built over the matched printings.
 */
export function buildPromoTreeFromMatches(
  matched: Printing[],
  channels: DistributionChannelWithCount[],
): ChannelNode[] {
  const perChannel = new Map<string, Printing[]>();
  for (const printing of matched) {
    for (const link of printing.distributionChannels) {
      const list = perChannel.get(link.channel.id);
      if (list) {
        list.push(printing);
      } else {
        perChannel.set(link.channel.id, [printing]);
      }
    }
  }
  return buildPromoTree(channels, perChannel);
}

interface SortPrintingsInput {
  printings: Printing[];
  sort: PromoSortField;
  prices: PriceLookup | undefined;
  priceMarketplace: Marketplace;
}

/**
 * Sort a printing list by the chosen field. "canonical" preserves the data's
 * canonicalRank ordering. Unknown sort values fall through to canonical so URL
 * collisions with /cards-only sort options don't crash the page.
 * @returns A new sorted array (does not mutate input).
 */
export function sortPromoPrintings(input: SortPrintingsInput): Printing[] {
  const { printings, sort, prices, priceMarketplace } = input;
  switch (sort) {
    case "name": {
      return printings.toSorted((a, b) => a.card.name.localeCompare(b.card.name));
    }
    case "code": {
      return printings.toSorted((a, b) => a.publicCode.localeCompare(b.publicCode));
    }
    case "recent": {
      return printings.toSorted((a, b) => {
        const setCompare = b.setId.localeCompare(a.setId);
        return setCompare === 0 ? a.canonicalRank - b.canonicalRank : setCompare;
      });
    }
    case "priceAsc": {
      return printings.toSorted((a, b) => {
        const priceA = prices?.get(a.id, priceMarketplace) ?? PRICE_SORT_FALLBACK;
        const priceB = prices?.get(b.id, priceMarketplace) ?? PRICE_SORT_FALLBACK;
        return priceA - priceB;
      });
    }
    case "priceDesc": {
      return printings.toSorted((a, b) => {
        const priceA = prices?.get(a.id, priceMarketplace) ?? Number.NEGATIVE_INFINITY;
        const priceB = prices?.get(b.id, priceMarketplace) ?? Number.NEGATIVE_INFINITY;
        return priceB - priceA;
      });
    }
    default: {
      return printings.toSorted((a, b) => a.canonicalRank - b.canonicalRank);
    }
  }
}

const PROMO_SORT_FIELDS: ReadonlySet<PromoSortField> = new Set([
  "canonical",
  "name",
  "code",
  "recent",
  "priceAsc",
  "priceDesc",
]);

/**
 * Coerce an arbitrary sort string (URL value) into a known promo sort field,
 * defaulting to "canonical" when the value isn't recognised.
 * @returns A valid PromoSortField.
 */
export function asPromoSortField(value: string | undefined): PromoSortField {
  return value && PROMO_SORT_FIELDS.has(value as PromoSortField)
    ? (value as PromoSortField)
    : "canonical";
}
