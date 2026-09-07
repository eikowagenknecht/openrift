import type { Printing } from "@openrift/shared/types/catalog";
import type { GroupByField } from "@openrift/shared/types/search";

/**
 * Surfaces gate per-tile behavior (click-navigation by printing vs. card,
 * sibling scoping, count aggregation) on this, so it stays defined once.
 */
export function splitsCardIntoTiles(groupBy: GroupByField): boolean {
  return groupBy === "set" || groupBy === "rarity";
}

/**
 * Single source of truth for how a card collapses into tiles in "cards"
 * view. Every surface that does so (catalog, decks, lists, collections, the
 * SSR first-row preview) keys on this so they can't drift apart.
 */
export function cardsViewTileKey(printing: Printing, groupBy: GroupByField): string {
  switch (groupBy) {
    case "set": {
      return `${printing.cardId}|${printing.setId}`;
    }
    case "rarity": {
      return `${printing.cardId}|${printing.rarity}`;
    }
    default: {
      return printing.cardId;
    }
  }
}

/**
 * Callers pre-sort by their preferred tie-break (e.g. languageRank,
 * canonicalRank) so the first printing seen for a tile is the one the user prefers.
 */
export function dedupeToCardsViewTiles(printings: Printing[], groupBy: GroupByField): Printing[] {
  const seen = new Set<string>();
  const result: Printing[] = [];
  for (const printing of printings) {
    const key = cardsViewTileKey(printing, groupBy);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(printing);
    }
  }
  return result;
}

/**
 * For set/rarity grouping, keeps only the siblings from the representative's
 * set/rarity so counts, the add-variant popover, and sibling-swap stay
 * scoped to the tile; card-level axes return the siblings unchanged.
 */
export function tileSiblings(
  representative: Printing,
  siblings: Printing[] | undefined,
  groupBy: GroupByField,
): Printing[] | undefined {
  if (!siblings || (groupBy !== "set" && groupBy !== "rarity")) {
    return siblings;
  }
  const tileKey = cardsViewTileKey(representative, groupBy);
  return siblings.filter((sibling) => cardsViewTileKey(sibling, groupBy) === tileKey);
}
