import type { UnifiedMappingGroupResponse, UnifiedMappingPrintingResponse } from "@openrift/shared";

export type MarketplaceCoverageStatus = "full" | "partial" | "none" | "na";

export interface MarketplaceCoverage {
  status: MarketplaceCoverageStatus;
  mapped: number;
  total: number;
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

/**
 * Compute marketplace coverage for one card, accounting for sibling fan-out
 * (Cardmarket) and TCGplayer's English-only practical reality.
 *
 * - **TCGplayer**: counts sibling groups that have at least one English printing.
 *   A group is "covered" if its English printing has a TCG variant.
 * - **Cardmarket**: language-aggregate. Counts sibling groups; a group is
 *   "covered" if *any* of its printings has a CM variant (one mapping fans
 *   out to all sibling languages).
 * - **CardTrader**: per-language. Counts every printing; a printing is
 *   "covered" if it has a CT variant.
 *
 * @returns Per-marketplace coverage with mapped/total counts and a status bucket.
 */
export function computeCardCoverage(group: UnifiedMappingGroupResponse): CardCoverage {
  const siblingGroups = groupSiblings(group.printings);
  const tcgMappedPrintings = new Set(group.tcgplayer.assignments.map((a) => a.printingId));
  const cmMappedPrintings = new Set(group.cardmarket.assignments.map((a) => a.printingId));
  const ctMappedPrintings = new Set(group.cardtrader.assignments.map((a) => a.printingId));

  let tcgTotal = 0;
  let tcgMapped = 0;
  let cmTotal = 0;
  let cmMapped = 0;
  for (const siblings of siblingGroups) {
    cmTotal++;
    if (siblings.some((p) => cmMappedPrintings.has(p.printingId))) {
      cmMapped++;
    }
    const enPrintings = siblings.filter((p) => p.language === "EN");
    if (enPrintings.length > 0) {
      tcgTotal++;
      if (enPrintings.some((p) => tcgMappedPrintings.has(p.printingId))) {
        tcgMapped++;
      }
    }
  }

  const ctTotal = group.printings.length;
  const ctMapped = group.printings.filter((p) => ctMappedPrintings.has(p.printingId)).length;

  return {
    tcgplayer: {
      status: statusFromCounts(tcgMapped, tcgTotal),
      mapped: tcgMapped,
      total: tcgTotal,
    },
    cardmarket: { status: statusFromCounts(cmMapped, cmTotal), mapped: cmMapped, total: cmTotal },
    cardtrader: { status: statusFromCounts(ctMapped, ctTotal), mapped: ctMapped, total: ctTotal },
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
