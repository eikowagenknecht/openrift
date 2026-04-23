import type { UnifiedMappingGroupResponse, UnifiedMappingPrintingResponse } from "@openrift/shared";

/** Coverage status for one direction (printings-side or entries-side) on one marketplace. */
export type MarketplaceCoverageStatus = "full" | "partial" | "none" | "na";

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

/**
 * Group printings into sibling groups — printings that share everything except
 * language, matching the database fan-out rule for cross-language aggregate
 * marketplace variants (Cardmarket).
 *
 * @returns A list of sibling groups, each containing the printings that share the same physical-card key.
 */
function groupSiblings(
  printings: UnifiedMappingPrintingResponse[],
): UnifiedMappingPrintingResponse[][] {
  const groups = new Map<string, UnifiedMappingPrintingResponse[]>();
  for (const printing of printings) {
    const slugKey = [...printing.markerSlugs].sort().join("+");
    const key = `${printing.shortCode}|${printing.finish}|${printing.artVariant}|${printing.isSigned ? 1 : 0}|${slugKey}`;
    let bucket = groups.get(key);
    if (!bucket) {
      bucket = [];
      groups.set(key, bucket);
    }
    bucket.push(printing);
  }
  return [...groups.values()];
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
 * Compute marketplace coverage for one card, accounting for sibling fan-out
 * (Cardmarket) and TCGplayer's English-only practical reality.
 *
 * Printings-side counting:
 * - **TCGplayer**: counts sibling groups that have at least one English printing.
 *   A group is "covered" if its English printing has a TCG variant.
 * - **Cardmarket**: language-aggregate. Counts sibling groups; a group is
 *   "covered" if *any* of its printings has a CM variant (one mapping fans
 *   out to all sibling languages).
 * - **CardTrader**: per-language. Counts every printing; a printing is
 *   "covered" if it has a CT variant.
 *
 * Entries-side counting reads from each marketplace's `assignedProducts` (mapped
 * to a printing) and `stagedProducts` (candidates not yet bound) — totals are
 * the sum, and "mapped" is the assigned count.
 *
 * @returns Per-marketplace coverage, with independent printings + entries directions.
 */
export function computeCardCoverage(group: UnifiedMappingGroupResponse): CardCoverage {
  const siblingGroups = groupSiblings(group.printings);
  const tcgMappedPrintings = new Set(group.tcgplayer.assignments.map((a) => a.printingId));
  const cmMappedPrintings = new Set(group.cardmarket.assignments.map((a) => a.printingId));
  const ctMappedPrintings = new Set(group.cardtrader.assignments.map((a) => a.printingId));

  let tcgPrintingsTotal = 0;
  let tcgPrintingsMapped = 0;
  let cmPrintingsTotal = 0;
  let cmPrintingsMapped = 0;
  for (const siblings of siblingGroups) {
    cmPrintingsTotal++;
    if (siblings.some((p) => cmMappedPrintings.has(p.printingId))) {
      cmPrintingsMapped++;
    }
    const enPrintings = siblings.filter((p) => p.language === "EN");
    if (enPrintings.length > 0) {
      tcgPrintingsTotal++;
      if (enPrintings.some((p) => tcgMappedPrintings.has(p.printingId))) {
        tcgPrintingsMapped++;
      }
    }
  }

  const ctPrintingsTotal = group.printings.length;
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
      printings: direction(tcgPrintingsMapped, tcgPrintingsTotal),
      entries: direction(tcgEntriesMapped, tcgEntriesTotal),
    },
    cardmarket: {
      printings: direction(cmPrintingsMapped, cmPrintingsTotal),
      entries: direction(cmEntriesMapped, cmEntriesTotal),
    },
    cardtrader: {
      printings: direction(ctPrintingsMapped, ctPrintingsTotal),
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
