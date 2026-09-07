import { legendDisplayName, UNKNOWN_SET_INDEX } from "@openrift/shared";

import type { CardOwnership } from "@/hooks/use-deck-ownership";
import type { CatalogPosition } from "@/lib/catalog-position";
import { compareCatalogPosition } from "@/lib/catalog-position";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { compareDeckCardsByCurve } from "@/lib/deck-card-sort";
import type { DeckOverviewSort } from "@/stores/deck-overview-view-store";

export interface DeckListSortContext {
  getEntry: (card: DeckBuilderCard) => CardOwnership | undefined;
  rarityOrder: readonly string[];
  /**
   * A card ID's set prefix isn't alphabetical; this maps set ID to its place
   * in the catalog's set order for the ID sort.
   */
  setIndexById: ReadonlyMap<string, number>;
  /** Omit to fall back to the entry's `cheapestPrice`/`displayPrice`. */
  getRowPrice?: (card: DeckBuilderCard) => number | undefined;
  /** Omit to fall back to the entry's display printing's rarity. */
  getRowRarity?: (card: DeckBuilderCard) => string | undefined;
  /** Omit to fall back to the entry's display printing. */
  getRowPrinting?: (card: DeckBuilderCard) => { setId: string; shortCode: string } | undefined;
}

/** Rows with a missing set code / price / rarity / ownership fact always sort last, regardless of direction. */
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
  const byName = (a: DeckBuilderCard, b: DeckBuilderCard) =>
    legendDisplayName({ name: a.cardName, types: a.cardTypes, tags: a.tags }).localeCompare(
      legendDisplayName({ name: b.cardName, types: b.cardTypes, tags: b.tags }),
    );

  if (sortBy === "name") {
    return cards.toSorted((a, b) => dir * byName(a, b));
  }

  if (sortBy === "id") {
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
    return cards.toSorted((a, b) => dir * compareDeckCardsByCurve(a, b));
  }

  if (sortBy === "price") {
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

  return cards.toSorted((a, b) => {
    const as = ctx.getEntry(a)?.shortfall ?? 0;
    const bs = ctx.getEntry(b)?.shortfall ?? 0;
    return dir * (as - bs) || byName(a, b);
  });
}
