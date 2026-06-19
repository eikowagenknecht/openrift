import type { UnifiedMappingGroupResponse } from "@openrift/shared";

/** Coverage status for one direction (printings-side or entries-side) on one marketplace. */
type MarketplaceCoverageStatus = "full" | "partial" | "none" | "na";

export interface DirectionCoverage {
  status: MarketplaceCoverageStatus;
  /** Items on this side that are mapped to the other side. */
  mapped: number;
  /** Total items on this side considered for this marketplace. */
  total: number;
}

/**
 * Per-marketplace coverage broken down by direction:
 * - `printings`: do our printings have an entry on this marketplace?
 * - `entries`: do this marketplace's entries match a printing of ours?
 *
 * Each side is colored independently so the two failure modes (missing entries
 * vs. orphan entries) are visible at a glance.
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
 * Compute marketplace coverage for one card.
 *
 * Printings-side: every printing has its own explicit marketplace variant (or
 * not) — totals are raw printing counts, mapped is the count with a direct
 * variant on that marketplace. Entries-side reads `assignedProducts` and
 * `stagedProducts` from the group.
 *
 * @returns Per-marketplace coverage, with independent printings + entries directions.
 */
export function computeCardCoverage(group: UnifiedMappingGroupResponse): CardCoverage {
  const tcgMappedPrintings = new Set(group.tcgplayer.assignments.map((a) => a.printingId));
  const cmMappedPrintings = new Set(group.cardmarket.assignments.map((a) => a.printingId));
  const ctMappedPrintings = new Set(group.cardtrader.assignments.map((a) => a.printingId));

  const printingsTotal = group.printings.length;
  const tcgPrintingsMapped = group.printings.filter((p) =>
    tcgMappedPrintings.has(p.printingId),
  ).length;
  const cmPrintingsMapped = group.printings.filter((p) =>
    cmMappedPrintings.has(p.printingId),
  ).length;
  const ctPrintingsMapped = group.printings.filter((p) =>
    ctMappedPrintings.has(p.printingId),
  ).length;

  const tcgEntriesMapped = group.tcgplayer.assignedProducts.length;
  const tcgEntriesTotal = tcgEntriesMapped + group.tcgplayer.stagedProducts.length;
  const cmEntriesMapped = group.cardmarket.assignedProducts.length;
  const cmEntriesTotal = cmEntriesMapped + group.cardmarket.stagedProducts.length;
  const ctEntriesMapped = group.cardtrader.assignedProducts.length;
  const ctEntriesTotal = ctEntriesMapped + group.cardtrader.stagedProducts.length;

  return {
    tcgplayer: {
      printings: direction(tcgPrintingsMapped, printingsTotal),
      entries: direction(tcgEntriesMapped, tcgEntriesTotal),
    },
    cardmarket: {
      printings: direction(cmPrintingsMapped, printingsTotal),
      entries: direction(cmEntriesMapped, cmEntriesTotal),
    },
    cardtrader: {
      printings: direction(ctPrintingsMapped, printingsTotal),
      entries: direction(ctEntriesMapped, ctEntriesTotal),
    },
  };
}

/**
 * Build a map from card slug to coverage so the cards table can look up
 * coverage by row in O(1).
 *
 * @returns A Map keyed by `cardSlug` with the per-card coverage.
 */
export function buildCoverageMapBySlug(
  groups: UnifiedMappingGroupResponse[],
): Map<string, CardCoverage> {
  const result = new Map<string, CardCoverage>();
  for (const group of groups) {
    result.set(group.cardSlug, computeCardCoverage(group));
  }
  return result;
}

// ---------------------------------------------------------------------------
// Prices-to-assign buckets
// ---------------------------------------------------------------------------

export type Marketplace = "tcgplayer" | "cardmarket" | "cardtrader";

/**
 * One source+language slice of a card's unbound (staged) marketplace entries.
 *
 * The "prices to assign" filter splits on this so that, e.g., a CardTrader
 * French entry on a card that has no French printing doesn't drown out the
 * entries you can actually act on.
 */
export interface PriceAssignBucket {
  marketplace: Marketplace;
  /**
   * `null` for Cardmarket / TCGplayer (language-agnostic feeds, assumed EN); a
   * language code (`"EN"`, `"FR"`, …) for CardTrader, which is per-language.
   */
  language: string | null;
  /** Count of unbound (staged) products in this bucket. */
  unbound: number;
  /**
   * Whether a printing of the matching language exists on this card, so the
   * staged entries can actually be assigned. CardTrader French entries are
   * only assignable once a French printing exists; until then they're noise.
   */
  assignable: boolean;
}

// The language a staged product would be assigned against (CM/TCG default to EN).
function targetLanguage(language: string | null): string {
  return language ?? "EN";
}

/**
 * Stable scope key for a bucket, used in the URL and the scope picker.
 * Language-agnostic marketplaces collapse to their name (`"cardmarket"`,
 * `"tcgplayer"`); CardTrader carries its language (`"cardtrader:FR"`).
 *
 * @returns The scope key string.
 */
export function bucketScopeKey(
  bucket: Pick<PriceAssignBucket, "marketplace" | "language">,
): string {
  return bucket.language === null ? bucket.marketplace : `${bucket.marketplace}:${bucket.language}`;
}

const MARKETPLACE_LABELS: Record<Marketplace, string> = {
  tcgplayer: "TCGplayer",
  cardmarket: "Cardmarket",
  cardtrader: "CardTrader",
};

/** The umbrella scope key — every assignable bucket, across all sources. */
export const ALL_ASSIGNABLE_SCOPE = "all";

/**
 * Human label for a scope key (`"cardtrader:FR"` → `"CardTrader · FR"`).
 *
 * @returns The display label.
 */
export function scopeLabel(scope: string): string {
  if (scope === ALL_ASSIGNABLE_SCOPE) {
    return "All assignable";
  }
  const [marketplace, language] = scope.split(":") as [Marketplace, string?];
  const base = MARKETPLACE_LABELS[marketplace] ?? marketplace;
  return language ? `${base} · ${language}` : base;
}

/**
 * Split one card's unbound staged entries into source+language buckets, marking
 * each as assignable or not based on whether a matching-language printing exists.
 *
 * @returns One bucket per (marketplace, language) slice that has unbound entries.
 */
export function computePriceAssignBuckets(group: UnifiedMappingGroupResponse): PriceAssignBucket[] {
  const printingLanguages = new Set(group.printings.map((printing) => printing.language));
  const marketplaces: Marketplace[] = ["tcgplayer", "cardmarket", "cardtrader"];
  const buckets: PriceAssignBucket[] = [];

  for (const marketplace of marketplaces) {
    const staged = group[marketplace].stagedProducts;
    if (staged.length === 0) {
      continue;
    }
    // CM/TCG staged products carry no language (assumed EN), so they all fall
    // into the single `null` bucket. CardTrader splits per language.
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
 * Build a map from card slug to its prices-to-assign buckets.
 *
 * @returns A Map keyed by `cardSlug`; cards with no unbound entries get `[]`.
 */
export function buildPriceAssignBucketsBySlug(
  groups: UnifiedMappingGroupResponse[],
): Map<string, PriceAssignBucket[]> {
  const result = new Map<string, PriceAssignBucket[]>();
  for (const group of groups) {
    result.set(group.cardSlug, computePriceAssignBuckets(group));
  }
  return result;
}
