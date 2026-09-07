import { marketplaceLabel } from "@openrift/shared/marketplace";
import type { UnifiedMappingGroupResponse } from "@openrift/shared/types/api/admin";
import { marketplaceCarriesLanguage } from "@openrift/shared/types/pricing";
import { WellKnown } from "@openrift/shared/well-known";

type MarketplaceCoverageStatus = "full" | "partial" | "none" | "na";

export interface DirectionCoverage {
  status: MarketplaceCoverageStatus;
  mapped: number;
  total: number;
}

/**
 * `printings`: do our printings have an entry on this marketplace?
 * `entries`: do this marketplace's entries match a printing of ours?
 */
export interface MarketplaceCoverage {
  printings: DirectionCoverage;
  entries: DirectionCoverage;
}

export interface CardCoverage {
  tcgplayer: MarketplaceCoverage;
  cardmarket: MarketplaceCoverage;
  cardtrader: MarketplaceCoverage;
}

function statusFromCounts(mapped: number, total: number): MarketplaceCoverageStatus {
  if (total === 0) {
    return "na";
  }
  if (mapped === 0) {
    return "none";
  }
  if (mapped === total) {
    return "full";
  }
  return "partial";
}

function direction(mapped: number, total: number): DirectionCoverage {
  return { status: statusFromCounts(mapped, total), mapped, total };
}

/**
 * Printings-side totals count only printings the marketplace can carry, so a
 * card with SC printings reads "full" on TCGplayer once its EN printings are
 * mapped.
 */
export function computeCardCoverage(group: UnifiedMappingGroupResponse): CardCoverage {
  const tcgMappedPrintings = new Set(group.tcgplayer.assignments.map((a) => a.printingId));
  const cmMappedPrintings = new Set(group.cardmarket.assignments.map((a) => a.printingId));
  const ctMappedPrintings = new Set(group.cardtrader.assignments.map((a) => a.printingId));

  const tcgPrintings = group.printings.filter((p) =>
    marketplaceCarriesLanguage("tcgplayer", p.language),
  );
  const cmPrintings = group.printings.filter((p) =>
    marketplaceCarriesLanguage("cardmarket", p.language),
  );
  const ctPrintings = group.printings.filter((p) =>
    marketplaceCarriesLanguage("cardtrader", p.language),
  );

  const tcgPrintingsMapped = tcgPrintings.filter((p) =>
    tcgMappedPrintings.has(p.printingId),
  ).length;
  const cmPrintingsMapped = cmPrintings.filter((p) => cmMappedPrintings.has(p.printingId)).length;
  const ctPrintingsMapped = ctPrintings.filter((p) => ctMappedPrintings.has(p.printingId)).length;

  const tcgEntriesMapped = group.tcgplayer.assignedProducts.length;
  const tcgEntriesTotal = tcgEntriesMapped + group.tcgplayer.stagedProducts.length;
  const cmEntriesMapped = group.cardmarket.assignedProducts.length;
  const cmEntriesTotal = cmEntriesMapped + group.cardmarket.stagedProducts.length;
  const ctEntriesMapped = group.cardtrader.assignedProducts.length;
  const ctEntriesTotal = ctEntriesMapped + group.cardtrader.stagedProducts.length;

  return {
    tcgplayer: {
      printings: direction(tcgPrintingsMapped, tcgPrintings.length),
      entries: direction(tcgEntriesMapped, tcgEntriesTotal),
    },
    cardmarket: {
      printings: direction(cmPrintingsMapped, cmPrintings.length),
      entries: direction(cmEntriesMapped, cmEntriesTotal),
    },
    cardtrader: {
      printings: direction(ctPrintingsMapped, ctPrintings.length),
      entries: direction(ctEntriesMapped, ctEntriesTotal),
    },
  };
}

export function buildCoverageMapBySlug(
  groups: UnifiedMappingGroupResponse[],
): Map<string, CardCoverage> {
  const result = new Map<string, CardCoverage>();
  for (const group of groups) {
    result.set(group.cardSlug, computeCardCoverage(group));
  }
  return result;
}

type Marketplace = "tcgplayer" | "cardmarket" | "cardtrader";

export interface PriceAssignBucket {
  marketplace: Marketplace;
  /** Null for Cardmarket/TCGplayer (assumed EN); a language code for CardTrader. */
  language: string | null;
  unbound: number;
  /** Whether a matching-language printing exists on this card. */
  assignable: boolean;
}

function targetLanguage(language: string | null): string {
  return language ?? WellKnown.language.EN;
}

/**
 * Language-agnostic marketplaces collapse to their name (`"cardmarket"`);
 * CardTrader carries its language (`"cardtrader:FR"`).
 */
export function bucketScopeKey(
  bucket: Pick<PriceAssignBucket, "marketplace" | "language">,
): string {
  return bucket.language === null ? bucket.marketplace : `${bucket.marketplace}:${bucket.language}`;
}

export const ALL_ASSIGNABLE_SCOPE = "all";

/** Human label for a scope key (`"cardtrader:FR"` -> `"CardTrader · FR"`). */
export function scopeLabel(scope: string): string {
  if (scope === ALL_ASSIGNABLE_SCOPE) {
    return "All assignable";
  }
  const [marketplace, language] = scope.split(":") as [Marketplace, string?];
  const base = marketplaceLabel(marketplace);
  return language ? `${base} · ${language}` : base;
}

export function computePriceAssignBuckets(group: UnifiedMappingGroupResponse): PriceAssignBucket[] {
  const printingLanguages = new Set(group.printings.map((printing) => printing.language));
  const marketplaces: Marketplace[] = ["tcgplayer", "cardmarket", "cardtrader"];
  const buckets: PriceAssignBucket[] = [];

  for (const marketplace of marketplaces) {
    const staged = group[marketplace].stagedProducts;
    if (staged.length === 0) {
      continue;
    }
    const countByLanguage = new Map<string | null, number>();
    for (const product of staged) {
      const language = marketplace === "cardtrader" ? product.language : null;
      countByLanguage.set(language, (countByLanguage.get(language) ?? 0) + 1);
    }
    for (const [language, unbound] of countByLanguage) {
      buckets.push({
        marketplace,
        language,
        unbound,
        assignable: printingLanguages.has(targetLanguage(language)),
      });
    }
  }

  return buckets;
}

/**
 * The umbrella {@link ALL_ASSIGNABLE_SCOPE} counts only assignable buckets, so
 * entries for a language with no printing stay excluded by default.
 */
export function bucketsMatchScope(
  buckets: PriceAssignBucket[] | undefined,
  scope: string,
): boolean {
  if (!buckets) {
    return false;
  }
  if (scope === ALL_ASSIGNABLE_SCOPE) {
    return buckets.some((bucket) => bucket.unbound > 0 && bucket.assignable);
  }
  return buckets.some((bucket) => bucketScopeKey(bucket) === scope && bucket.unbound > 0);
}

export function buildPriceAssignBucketsBySlug(
  groups: UnifiedMappingGroupResponse[],
): Map<string, PriceAssignBucket[]> {
  const result = new Map<string, PriceAssignBucket[]>();
  for (const group of groups) {
    result.set(group.cardSlug, computePriceAssignBuckets(group));
  }
  return result;
}
