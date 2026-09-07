import { compareCatalogPosition } from "@/lib/catalog-position";

export type DeckCheckSort = "deck" | "id" | "name" | "domain" | "energy";

export interface DeckCheckSortableCard {
  sortOrder: number;
  rawName: string;
  resolvedPrintingId: string | null;
}

export interface DeckCheckCardIdentity {
  name: string;
  shortCode: string;
  setIndex: number;
  domains: string[];
  energy: number | null;
  power: number | null;
}

/**
 * Unmatched lines always sort last for "id", "domain", and "energy" so they
 * don't scatter through the grid; `sortOrder` breaks every remaining tie.
 */
export function sortDeckCheckCards<T extends DeckCheckSortableCard>(
  cards: T[],
  sortBy: DeckCheckSort,
  sortDir: "asc" | "desc",
  identify: (printingId: string | null) => DeckCheckCardIdentity | undefined,
  domainOrder: readonly string[] = [],
): T[] {
  if (sortBy === "deck") {
    return cards.toSorted((a, b) => a.sortOrder - b.sortOrder);
  }

  const dir = sortDir === "desc" ? -1 : 1;

  if (sortBy === "name") {
    return cards.toSorted((a, b) => {
      const aName = identify(a.resolvedPrintingId)?.name ?? a.rawName;
      const bName = identify(b.resolvedPrintingId)?.name ?? b.rawName;
      return dir * aName.localeCompare(bName) || a.sortOrder - b.sortOrder;
    });
  }

  if (sortBy === "domain") {
    const domainRank = (domain: string | undefined) => {
      if (domain === undefined) {
        return -1;
      }
      const rank = domainOrder.indexOf(domain);
      return rank === -1 ? domainOrder.length : rank;
    };
    return cards.toSorted((a, b) => {
      const aIdentity = identify(a.resolvedPrintingId);
      const bIdentity = identify(b.resolvedPrintingId);
      if (aIdentity === undefined && bIdentity === undefined) {
        return a.sortOrder - b.sortOrder;
      }
      if (aIdentity === undefined) {
        return 1;
      }
      if (bIdentity === undefined) {
        return -1;
      }
      // Compare domain lists position by position; a missing second domain
      // ranks -1 so mono-domain cards come before duals with the same first.
      for (let i = 0; i < Math.max(aIdentity.domains.length, bIdentity.domains.length); i++) {
        const rankDiff = domainRank(aIdentity.domains.at(i)) - domainRank(bIdentity.domains.at(i));
        if (rankDiff !== 0) {
          return dir * rankDiff;
        }
      }
      return dir * aIdentity.name.localeCompare(bIdentity.name) || a.sortOrder - b.sortOrder;
    });
  }

  if (sortBy === "energy") {
    // Numbered values rank before `null` (treated as +Infinity) within a group.
    const compareValue = (a: number | null, b: number | null) => {
      const aRank = a ?? Number.POSITIVE_INFINITY;
      const bRank = b ?? Number.POSITIVE_INFINITY;
      return aRank === bRank ? 0 : aRank < bRank ? -1 : 1;
    };
    return cards.toSorted((a, b) => {
      const aIdentity = identify(a.resolvedPrintingId);
      const bIdentity = identify(b.resolvedPrintingId);
      if (aIdentity === undefined && bIdentity === undefined) {
        return a.sortOrder - b.sortOrder;
      }
      if (aIdentity === undefined) {
        return 1;
      }
      if (bIdentity === undefined) {
        return -1;
      }
      const energyDiff = compareValue(aIdentity.energy, bIdentity.energy);
      if (energyDiff !== 0) {
        return dir * energyDiff;
      }
      const powerDiff = compareValue(aIdentity.power, bIdentity.power);
      if (powerDiff !== 0) {
        return dir * powerDiff;
      }
      return dir * aIdentity.name.localeCompare(bIdentity.name) || a.sortOrder - b.sortOrder;
    });
  }

  // sortBy === "id": by set order then printing short code, unmatched lines
  // pinned to the end.
  return cards.toSorted((a, b) => {
    const aIdentity = identify(a.resolvedPrintingId);
    const bIdentity = identify(b.resolvedPrintingId);
    if (aIdentity === undefined && bIdentity === undefined) {
      return a.sortOrder - b.sortOrder;
    }
    if (aIdentity === undefined) {
      return 1;
    }
    if (bIdentity === undefined) {
      return -1;
    }
    return dir * compareCatalogPosition(aIdentity, bIdentity) || a.sortOrder - b.sortOrder;
  });
}
