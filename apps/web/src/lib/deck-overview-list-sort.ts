import type { CardOwnership } from "@/hooks/use-deck-ownership";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { compareDeckCardsByCurve } from "@/lib/deck-card-sort";
import type { DeckOverviewSort } from "@/stores/deck-overview-view-store";

/** Extra per-card facts the price / rarity / ownership sorts read from ownership data. */
export interface DeckListSortContext {
  /** Resolves the ownership entry for a card row (price, rarity, owned/needed). */
  getEntry: (card: DeckBuilderCard) => CardOwnership | undefined;
  /** Rarity slugs in display order; unknown/absent rarities sort last. */
  rarityOrder: readonly string[];
}

/**
 * Orders the card rows inside one zone (or one type group of a grouped zone)
 * for the overview's list mode. "default" always returns the sidebar's curve
 * order (energy → power → name) with the direction ignored, mirroring the
 * thumbnail dashboard. The other sorts are direction-aware and fall back to the
 * card name as a stable tiebreaker.
 *
 * Rows whose price / rarity / ownership fact is missing (no ownership data
 * loaded yet, or a card with no catalog printing) sort last regardless of
 * direction, so unresolved rows don't scatter through the list.
 *
 * @returns A new, sorted array; the input is not mutated.
 */
export function sortDeckOverviewList(
  cards: DeckBuilderCard[],
  sortBy: DeckOverviewSort,
  sortDir: "asc" | "desc",
  ctx: DeckListSortContext,
): DeckBuilderCard[] {
  if (sortBy === "default") {
    return cards.toSorted(compareDeckCardsByCurve);
  }

  const dir = sortDir === "desc" ? -1 : 1;
  const byName = (a: DeckBuilderCard, b: DeckBuilderCard) => a.cardName.localeCompare(b.cardName);

  if (sortBy === "name") {
    return cards.toSorted((a, b) => dir * byName(a, b));
  }

  if (sortBy === "energy") {
    // compareDeckCardsByCurve already does energy → power → name ascending.
    return cards.toSorted((a, b) => dir * compareDeckCardsByCurve(a, b));
  }

  if (sortBy === "price") {
    return cards.toSorted((a, b) => {
      const ap = ctx.getEntry(a)?.displayPrice;
      const bp = ctx.getEntry(b)?.displayPrice;
      if (ap === undefined && bp === undefined) {
        return byName(a, b);
      }
      if (ap === undefined) {
        return 1;
      }
      if (bp === undefined) {
        return -1;
      }
      return dir * (ap - bp) || byName(a, b);
    });
  }

  if (sortBy === "rarity") {
    const rank = (slug: string | undefined) => {
      if (slug === undefined) {
        return ctx.rarityOrder.length;
      }
      const index = ctx.rarityOrder.indexOf(slug);
      return index === -1 ? ctx.rarityOrder.length : index;
    };
    return cards.toSorted((a, b) => {
      const ar = ctx.getEntry(a)?.displayPrinting?.rarity;
      const br = ctx.getEntry(b)?.displayPrinting?.rarity;
      if (ar === undefined && br === undefined) {
        return byName(a, b);
      }
      if (ar === undefined) {
        return 1;
      }
      if (br === undefined) {
        return -1;
      }
      return dir * (rank(ar) - rank(br)) || byName(a, b);
    });
  }

  // sortBy === "ownership": by how many copies are still missing. Ascending
  // puts fully-owned cards first; flip the direction for missing-first.
  return cards.toSorted((a, b) => {
    const as = ctx.getEntry(a)?.shortfall ?? 0;
    const bs = ctx.getEntry(b)?.shortfall ?? 0;
    return dir * (as - bs) || byName(a, b);
  });
}
