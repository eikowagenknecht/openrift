import type { DeckCheckSort } from "@/stores/deck-check-view-store";

/** The subset of a checker card line the sort needs. */
export interface DeckCheckSortableCard {
  /** Import order within the list; the "deck" sort and every tiebreaker use it. */
  sortOrder: number;
  /** The imported name, used when a line isn't matched to the catalogue. */
  rawName: string;
  resolvedPrintingId: string | null;
}

/** Catalogue identity resolved for a matched printing. */
export interface DeckCheckCardIdentity {
  /** Display name from the catalogue. */
  name: string;
  /** Set + collector code, e.g. "OGN-001". */
  shortCode: string;
  /** Domain slugs in card order (one or two entries). */
  domains: string[];
  /** Energy cost; `null` for cards that have none (sorts last). */
  energy: number | null;
  /** Power; `null` for cards that have none (sorts last). */
  power: number | null;
}

/**
 * Order the card lines inside one checker zone. "deck" keeps the import order
 * (direction is ignored — it mirrors the physical pile). "name" sorts by the
 * resolved catalogue name (falling back to the raw imported name), "id" by the
 * printing's short code, "domain" by the card's domains in `domainOrder`
 * (mono-domain before duals sharing the same first domain), then by name.
 * "energy" sorts by energy cost, then power, then name. For "id", "domain", and
 * "energy", lines with no matched printing have no code/domains/cost and always
 * sort last so unresolved entries don't scatter through the grid; matched cards
 * with a `null` energy or power rank after numbered cards within their group.
 * `sortOrder` breaks every tie so the result is stable.
 * @returns A new, sorted array; the input is not mutated.
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

  // sortBy === "id": by printing short code, unmatched lines pinned to the end.
  return cards.toSorted((a, b) => {
    const aCode = identify(a.resolvedPrintingId)?.shortCode;
    const bCode = identify(b.resolvedPrintingId)?.shortCode;
    if (aCode === undefined && bCode === undefined) {
      return a.sortOrder - b.sortOrder;
    }
    if (aCode === undefined) {
      return 1;
    }
    if (bCode === undefined) {
      return -1;
    }
    return dir * aCode.localeCompare(bCode) || a.sortOrder - b.sortOrder;
  });
}
