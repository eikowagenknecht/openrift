import type { UnifiedMappingGroupResponse } from "@openrift/shared";

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
