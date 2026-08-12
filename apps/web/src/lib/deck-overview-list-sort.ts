import { UNKNOWN_SET_INDEX } from "@openrift/shared";

import type { CardOwnership } from "@/hooks/use-deck-ownership";
import type { CatalogPosition } from "@/lib/catalog-position";
import { compareCatalogPosition } from "@/lib/catalog-position";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { compareDeckCardsByCurve } from "@/lib/deck-card-sort";
import type { DeckOverviewSort } from "@/stores/deck-overview-view-store";

/** Extra per-card facts the price / rarity / ownership sorts read from ownership data. */
export interface DeckListSortContext {
  /** Resolves the ownership entry for a card row (price, rarity, owned/needed). */
  getEntry: (card: DeckBuilderCard) => CardOwnership | undefined;
  /** Rarity slugs in display order; unknown/absent rarities sort last. */
  rarityOrder: readonly string[];
  /**
   * Each set's place in the app's set order, for the ID sort — a card ID is a
   * set plus a number, and the set half orders by the catalog's set order
   * rather than by the alphabetical prefix inside the code.
   */
  setIndexById: ReadonlyMap<string, number>;
  /**
   * The price the row actually shows — with "show my printings" on, rows
   * price the printing the viewer owns; otherwise the cheapest acceptable
   * printing. Supply it and the price sort follows the visible numbers,
   * including the rows it leaves unpriced; omit it and the sort reads the
   * entry's `cheapestPrice` (display price as last resort).
   */
  getRowPrice?: (card: DeckBuilderCard) => number | undefined;
  /**
   * The rarity the row actually shows, for the same reason as
   * {@link DeckListSortContext.getRowPrice}: the rarity icon follows the
   * printing on screen, which is the viewer's own while "show my printings" is
   * on. Omit it and the sort reads the entry's display printing.
   */
  getRowRarity?: (card: DeckBuilderCard) => string | undefined;
  /**
   * The printing whose ID the row actually shows, for the same reason as
   * {@link DeckListSortContext.getRowPrice}: the set code follows the printing
   * on screen, which is the viewer's own while "show my printings" is on. Omit
   * it and the sort reads the entry's display printing.
   */
  getRowPrinting?: (card: DeckBuilderCard) => { setId: string; shortCode: string } | undefined;
}

/**
 * Orders the card rows inside one zone (or one type group of a grouped zone)
 * for the overview's list mode. "default" always returns the sidebar's curve
 * order (energy → power → name) with the direction ignored, mirroring the
 * thumbnail dashboard. The other sorts are direction-aware and fall back to the
 * card name as a stable tiebreaker.
 *
 * Rows whose set code / price / rarity / ownership fact is missing (no ownership data
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

  if (sortBy === "id") {
    // Same presence rule as price and rarity below: a row whose printing the
    // resolver can't produce shows no ID, so it belongs at the end rather than
    // sorting by a code that isn't on screen.
    const printingOf =
      ctx.getRowPrinting ?? ((card: DeckBuilderCard) => ctx.getEntry(card)?.displayPrinting);
    const positionOf = (card: DeckBuilderCard): CatalogPosition | undefined => {
      const printing = printingOf(card);
      if (!printing) {
        return undefined;
      }
      return {
        setIndex: ctx.setIndexById.get(printing.setId) ?? UNKNOWN_SET_INDEX,
        shortCode: printing.shortCode,
      };
    };
    return cards.toSorted((a, b) => {
      const ap = positionOf(a);
      const bp = positionOf(b);
      if (ap === undefined && bp === undefined) {
        return byName(a, b);
      }
      if (ap === undefined) {
        return 1;
      }
      if (bp === undefined) {
        return -1;
      }
      return dir * compareCatalogPosition(ap, bp) || byName(a, b);
    });
  }

  if (sortBy === "energy") {
    // compareDeckCardsByCurve already does energy → power → name ascending.
    return cards.toSorted((a, b) => dir * compareDeckCardsByCurve(a, b));
  }

  if (sortBy === "price") {
    // Presence of the resolver decides, not its result: a row it prices as
    // undefined renders blank, so it must sort last rather than fall back to a
    // price the user can't see.
    const priceOf =
      ctx.getRowPrice ??
      ((card: DeckBuilderCard) => {
        const entry = ctx.getEntry(card);
        return entry?.cheapestPrice ?? entry?.displayPrice;
      });
    return cards.toSorted((a, b) => {
      const ap = priceOf(a);
      const bp = priceOf(b);
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
    // Presence decides, exactly as for the price above: a row the resolver
    // gives no rarity shows no rarity icon, so it belongs with the unknowns
    // rather than sorting by a rarity that isn't on screen.
    const rarityOf =
      ctx.getRowRarity ?? ((card: DeckBuilderCard) => ctx.getEntry(card)?.displayPrinting?.rarity);
    return cards.toSorted((a, b) => {
      const ar = rarityOf(a);
      const br = rarityOf(b);
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
